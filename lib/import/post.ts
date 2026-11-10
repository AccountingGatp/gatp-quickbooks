// Posting an import to QuickBooks, in small timed chunks (the browser calls this repeatedly, so it
// works within Vercel's time limits and can be resumed from History if the tab is closed).
// Safety:
//  - one poster per import at a time (job lock)
//  - every QuickBooks batch carries a requestid built from its rows, so a retried chunk is not created twice
//  - only transactions whose rows are all "ready" are posted; rows with errors are left out
import { ObjectId } from "mongodb";
import { createHash } from "crypto";
import { jobRows, jobs } from "../db";
import { batch, query, escapeQ, type BatchOp } from "../qbo/client";
import { addToList } from "../qbo/lists";
import { logActivity } from "../audit";
import { entityDef, type BuildCtx } from "./entities";
import { Resolver, norm, type Ref } from "./resolver";
import { fillGroup, jobSettings, recount, refKinds } from "./validate";
import type { CreatedRef, JobDoc, ListKind, RowDoc } from "../types";

const LOCK_MS = 90_000;

export async function lockJob(id: ObjectId, user: string) {
  const now = Date.now();
  const r = await (await jobs()).findOneAndUpdate(
    { _id: id, $or: [{ lockUntil: { $exists: false } }, { lockUntil: { $lt: now } }] },
    { $set: { lockUntil: now + LOCK_MS } },
  );
  if (!r) throw new Error("This import is being worked on in another tab or by another person. Wait a moment and try again.");
  return r;
}
export async function unlockJob(id: ObjectId) {
  await (await jobs()).updateOne({ _id: id }, { $unset: { lockUntil: "" } });
}

const requestId = (jobId: string, parts: string[]) =>
  createHash("sha256").update(jobId + "|" + parts.join(",")).digest("hex").slice(0, 36);

/** Create names that the file uses but QuickBooks does not have yet (vendors, customers, classes, …). */
async function createMissing(job: JobDoc, r: Resolver, def: ReturnType<typeof entityDef>, rows: RowDoc[], created: CreatedRef[]) {
  const need = new Map<string, { kind: ListKind; name: string }>();
  for (const row of rows) {
    for (const f of def.fields) {
      if (f.type !== "ref" || !f.ref || !row.values[f.key]) continue;
      const prefer = f.prefer || (def.key === "deposits" || def.group === "Sales" ? "Customer" : "Vendor");
      if (r.find(f.ref, row.values[f.key], prefer)) continue;
      const k = r.canCreate(f.ref, prefer);
      if (k) need.set(`${k}|${norm(row.values[f.key])}`, { kind: k, name: row.values[f.key].trim() });
    }
  }
  const list = [...need.values()];
  for (let i = 0; i < list.length; i += 30) {
    const part = list.slice(i, i + 30);
    const ops: BatchOp[] = part.map((n, j) => ({
      bId: String(j), operation: "create", entity: n.kind,
      body: ["Vendor", "Customer"].includes(n.kind) ? { DisplayName: n.name.replace(/:/g, "-").slice(0, 500) } : { Name: n.name.replace(/:/g, "-").slice(0, 100) },
    }));
    const res = await batch(job.realmId, ops, requestId(String(job._id), ["names", ...part.map((p) => p.kind + p.name)]));
    for (let j = 0; j < part.length; j++) {
      const n = part[j], x = res[j];
      if (x.ok) {
        const item = { id: x.entity.Id, name: x.entity.DisplayName || x.entity.Name, full: x.entity.FullyQualifiedName, active: true, syncToken: x.entity.SyncToken, kind: n.kind };
        r.add(n.kind, item);
        await addToList(job.realmId, n.kind, item);
        created.push({ type: n.kind, id: x.entity.Id, name: item.name });
      } else if (/duplicate/i.test(x.error || "")) {
        // made by someone else meanwhile (or exists as another name type): re-read and continue
        await r.load([n.kind], true);
      }
    }
  }
}

export type PostProgress = { done: boolean; counts: JobDoc["counts"]; status: string; message?: string };

export async function postChunk(jobId: string, user: string, budgetMs = 40_000): Promise<PostProgress> {
  const id = new ObjectId(jobId);
  const job = await lockJob(id, user);
  const started = Date.now();
  const J = await jobs(), Rw = await jobRows();
  try {
    if (!["review", "posting", "partial", "failed"].includes(job.status)) throw new Error("This import cannot be posted in its current state.");
    const def = entityDef(job.entity);
    const settings = await jobSettings(job);
    const r = new Resolver(job.realmId, settings);
    await r.load(refKinds(def));
    if (job.status !== "posting") {
      await J.updateOne({ _id: id }, { $set: { status: "posting", updatedAt: new Date() } });
      await logActivity({ user, realmId: job.realmId, companyName: job.companyName, action: "Started posting", detail: `${job.entityLabel}, ${job.fileName}`, jobId });
    }
    const created: CreatedRef[] = [...(job.created || [])];
    const all = await Rw.find({ jobId, status: { $in: ["ready", "posting", "error"] } }).sort({ idx: 1 }).toArray();
    // groups that can be posted: every non-skipped row is ready (or was mid-post)
    const byGroup = new Map<string, RowDoc[]>();
    for (const row of all) byGroup.set(row.group, [...(byGroup.get(row.group) || []), row]);
    const postable = [...byGroup.entries()].filter(([, rows]) => rows.every((x) => x.status === "ready" || x.status === "posting"));

    const ctx: BuildCtx = { r, settings, flip: !!job.flipSign, docs: new Map() };
    // payment files: look up the bills / invoices they apply to
    for (const dl of def.docLookups || []) {
      const nums = [...new Set(postable.flatMap(([, rows]) => rows.map((x) => x.values[dl.field]).filter(Boolean)))];
      for (let i = 0; i < nums.length; i += 40) {
        const res = await query(job.realmId, `select * from ${dl.type} where DocNumber IN (${nums.slice(i, i + 40).map((n) => `'${escapeQ(n)}'`).join(",")}) maxresults 1000`);
        for (const t of res[dl.type] || []) {
          const k = `${dl.type}|${String(t.DocNumber).toLowerCase()}`;
          ctx.docs.set(k, [...(ctx.docs.get(k) || []), { id: t.Id, party: t.VendorRef?.value || t.CustomerRef?.value }]);
        }
      }
    }

    let cursor = 0;
    while (cursor < postable.length && Date.now() - started < budgetMs) {
      const chunk = postable.slice(cursor, cursor + 30);
      cursor += chunk.length;
      const chunkRows = chunk.flatMap(([, rows]) => rows);
      await createMissing(job, r, def, chunkRows, created);

      const ops: BatchOp[] = [];
      const failed: { rows: RowDoc[]; error: string }[] = [];
      chunk.forEach(([g, rows], j) => {
        try {
          const b = def.build(fillGroup(def, rows.map((x) => x.values)), ctx);
          ops.push({ bId: String(j), operation: "create", entity: b.entity, body: b.body });
        } catch (e) {
          failed.push({ rows, error: (e as Error).message });
        }
      });
      const rid = requestId(jobId, chunk.map(([g, rows]) => g + ":" + rows.map((x) => x.idx).join(".")));
      const okGroups = chunk.filter((_, j) => ops.some((o) => o.bId === String(j)));
      await Rw.updateMany({ jobId, group: { $in: okGroups.map(([g]) => g) }, status: { $in: ["ready", "posting"] } }, { $set: { status: "posting", requestId: rid } });

      const results = await batch(job.realmId, ops, rid);
      const now = new Date();
      const bulk = [];
      for (const res of results) {
        const [, rows] = chunk[Number(res.bId)];
        const op = ops.find((o) => o.bId === res.bId)!;
        const e = res.entity || {};
        bulk.push({
          updateMany: {
            filter: { jobId, idx: { $in: rows.map((x) => x.idx) } },
            update: res.ok
              ? { $set: { status: "posted" as const, postedAt: now, qbo: { type: op.entity, id: String(e.Id), docNumber: e.DocNumber, syncToken: e.SyncToken, total: Number(e.TotalAmt ?? e.Amount ?? 0), paymentType: e.PaymentType, credit: !!e.Credit } }, $unset: { error: "" } }
              : { $set: { status: "failed" as const, error: res.error } },
          },
        });
        if (res.ok && def.list) {
          const kind = def.list.kind as ListKind;
          const item = { id: String(e.Id), name: e.DisplayName || e.Name, full: e.FullyQualifiedName, active: true, kind, type: e.AccountType || e.Type };
          r.add(kind, item);
          await addToList(job.realmId, kind, item);
        }
      }
      for (const f of failed) bulk.push({ updateMany: { filter: { jobId, idx: { $in: f.rows.map((x) => x.idx) } }, update: { $set: { status: "failed" as const, error: f.error } } } });
      if (bulk.length) await Rw.bulkWrite(bulk as any, { ordered: false });
      await J.updateOne({ _id: id }, { $set: { created, lockUntil: Date.now() + LOCK_MS, updatedAt: new Date() } });
    }

    const counts = await recount(jobId);
    const remaining = await Rw.countDocuments({ jobId, status: { $in: ["ready", "posting"] } });
    const done = remaining === 0 || cursor >= postable.length;
    let status: JobDoc["status"] = "posting";
    if (done) {
      status = counts.posted === 0 ? "failed" : counts.failed || counts.error ? "partial" : "completed";
      await logActivity({ user, realmId: job.realmId, companyName: job.companyName, action: status === "completed" ? "Posted import" : status === "partial" ? "Posted import (some rows not posted)" : "Import failed", detail: `${job.entityLabel}, ${counts.posted} rows posted, ${counts.failed} failed${created.length ? `, ${created.length} new names created` : ""}`, jobId });
    }
    await J.updateOne({ _id: id }, { $set: { counts, status, updatedAt: new Date(), ...(done ? { finishedAt: new Date() } : {}) } });
    return { done, counts, status };
  } finally {
    await unlockJob(id);
  }
}

// ---------------------------------------------------------------- undo
const LIST_TYPES = new Set(["Customer", "Vendor", "Employee", "Item", "Account", "Class", "Department", "PaymentMethod", "Term"]);

export async function rollbackChunk(jobId: string, user: string, budgetMs = 40_000): Promise<PostProgress> {
  const id = new ObjectId(jobId);
  const job = await lockJob(id, user);
  const started = Date.now();
  const J = await jobs(), Rw = await jobRows();
  try {
    if (job.kind !== "import") throw new Error("Only imports can be undone.");
    const posted = await Rw.find({ jobId, status: "posted", qbo: { $exists: true } }).sort({ idx: 1 }).toArray();
    // one QuickBooks record may cover several rows
    const recs = new Map<string, { type: string; id: string; syncToken?: string; idxs: number[] }>();
    for (const row of posted) {
      const k = `${row.qbo!.type}|${row.qbo!.id}`;
      const cur = recs.get(k) || { type: row.qbo!.type, id: row.qbo!.id, syncToken: row.qbo!.syncToken, idxs: [] };
      cur.idxs.push(row.idx);
      recs.set(k, cur);
    }
    const list = [...recs.values()];
    const problems: string[] = [];
    for (let i = 0; i < list.length && Date.now() - started < budgetMs; i += 30) {
      const part = list.slice(i, i + 30);
      const run = async (items: typeof part) => batch(job.realmId, items.map((x, j) => LIST_TYPES.has(x.type)
        ? { bId: String(j), operation: "update" as const, entity: x.type, body: { Id: x.id, SyncToken: x.syncToken || "0", sparse: true, Active: false } }
        : { bId: String(j), operation: "delete" as const, entity: x.type, body: { Id: x.id, SyncToken: x.syncToken || "0" } }));
      let res = await run(part);
      // edited in QuickBooks since posting: read the latest version and try once more
      const stale = part.filter((_, j) => !res[j].ok && /stale|syncToken/i.test(res[j].error || ""));
      if (stale.length) {
        for (const s of stale) {
          const q = await query(job.realmId, `select * from ${s.type} where Id = '${s.id}'`);
          s.syncToken = q[s.type]?.[0]?.SyncToken ?? s.syncToken;
        }
        const res2 = await run(stale);
        res = res.map((x, j) => { const k = stale.indexOf(part[j]); return k >= 0 ? res2[k] : x; });
      }
      const bulk = part.map((x, j) => {
        const ok = res[j].ok || /not found|deleted/i.test(res[j].error || "");
        if (!ok) problems.push(`${x.type} ${x.id}: ${res[j].error}`);
        return { updateMany: { filter: { jobId, idx: { $in: x.idxs } }, update: ok ? { $set: { status: "rolled_back" as const } } : { $set: { error: `Undo failed: ${res[j].error}` } } } };
      });
      await Rw.bulkWrite(bulk as any, { ordered: false });
      await J.updateOne({ _id: id }, { $set: { lockUntil: Date.now() + LOCK_MS } });
    }
    const stillThere = await Rw.find({ jobId, status: "posted" }, { projection: { error: 1 } }).toArray();
    const left = stillThere.filter((x) => !String(x.error || "").startsWith("Undo failed")).length;
    const done = left === 0;
    if (done && job.created?.length) {
      // names this import created: make them inactive (QuickBooks never deletes names)
      for (let i = 0; i < job.created.length; i += 30) {
        const part = job.created.slice(i, i + 30);
        const cur = await Promise.all(part.map((c) => query(job.realmId, `select * from ${c.type} where Id = '${c.id}'`).then((q) => q[c.type]?.[0])));
        await batch(job.realmId, part.map((c, j) => ({ bId: String(j), operation: "update", entity: c.type, body: { Id: c.id, SyncToken: cur[j]?.SyncToken || "0", sparse: true, Active: false } })));
      }
    }
    const counts = await recount(jobId);
    const stillPosted = counts.posted;
    if (done) {
      await logActivity({ user, realmId: job.realmId, companyName: job.companyName, action: "Undid import", detail: `${job.entityLabel}, ${counts.rolledBack} rows removed from QuickBooks${stillPosted ? `, ${stillPosted} could not be removed` : ""}`, jobId });
    }
    await J.updateOne({ _id: id }, { $set: { counts, updatedAt: new Date(), ...(done ? { status: stillPosted ? "partial" : "rolled_back", finishedAt: new Date() } : {}) } });
    return { done, counts, status: done ? (stillPosted ? "partial" : "rolled_back") : "posting", message: problems.slice(0, 5).join("\n") || undefined };
  } finally {
    await unlockJob(id);
  }
}
