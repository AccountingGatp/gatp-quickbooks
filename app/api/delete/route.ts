// Persist full backups before contacting QuickBooks. Changed records are never force-deleted.
import { ObjectId } from "mongodb";
import { createHash } from "crypto";
import { jobs, jobRows } from "@/lib/db";
import { requireCompany, route } from "@/lib/http";
import { batch } from "@/lib/qbo/client";
import { QB_TYPE } from "@/lib/export";
import { EMPTY_COUNTS } from "@/lib/jobs";
import { logActivity } from "@/lib/audit";
import { lockJob, unlockJob, lockCompany, unlockCompany } from "@/lib/import/post";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = route(async (req: Request) => {
  const { session, company } = await requireCompany();
  const b = await req.json();
  const t = QB_TYPE.get(String(b.type));
  if (!t?.deletable) throw new Error("This kind of record cannot be deleted here.");
  const recs: any[] = b.records;
  if (!Array.isArray(recs) || !recs.length || recs.length > 60) throw new Error("Choose between 1 and 60 records per request.");
  if (recs.some((r) => !r || !/^\d+$/.test(String(r.Id)) || r.SyncToken == null)) throw new Error("Every record needs its QuickBooks ID and current SyncToken.");
  if (new Set(recs.map((r) => String(r.Id))).size !== recs.length) throw new Error("The delete request contains duplicate record IDs.");
  const J = await jobs(), R = await jobRows();
  const jobId = b.jobId ? new ObjectId(String(b.jobId)) : new ObjectId();
  if (!b.jobId) {
    await J.insertOne({ _id: jobId, kind: "delete", entity: t.key, entityLabel: t.label, realmId: company._id, companyName: company.name, user: session.name, status: "posting", counts: { ...EMPTY_COUNTS, total: Number(b.total || recs.length) }, filter: b.filter, createdAt: new Date(), updatedAt: new Date() });
    await logActivity({ user: session.name, realmId: company._id, companyName: company.name, action: "Started bulk delete", detail: `${t.label}, ${b.total || recs.length} records`, jobId: String(jobId) });
  }
  const job = await lockJob(jobId, session.name);
  let companyLock: string | undefined;
  try {
    if (job.kind !== "delete" || job.realmId !== company._id || job.entity !== t.key) throw new Error("This delete job belongs to a different company or transaction type.");
    companyLock = await lockCompany(company._id);
    const id = String(jobId);
    const saved = await R.find({ jobId: id }).sort({ idx: 1 }).toArray();
    const byId = new Map(saved.map((r) => [String(r.qbo?.id), r]));
    let next = saved.reduce((n, r) => Math.max(n, r.idx + 1), 0);
    const newRows = recs.filter((r) => !byId.has(String(r.Id))).map((r) => {
      const idx = next++;
      return { _id: new ObjectId(), jobId: id, idx, sheetRow: idx + 1, raw: r, values: { id: String(r.Id), date: r.TxnDate || "", number: r.DocNumber || "", total: String(r.TotalAmt ?? r.Amount ?? "") }, group: `delete:${t.key}:${r.Id}`, status: "pending" as const, issues: [], qbo: { type: t.key, id: String(r.Id) } };
    });
    // If this write fails, no delete request has been sent.
    if (newRows.length) {
      await R.insertMany(newRows);
      for (const row of newRows) byId.set(row.qbo.id, row);
    }
    const results: { id: string; ok: boolean; error?: string }[] = [];
    const pending = recs.map((r) => byId.get(String(r.Id))!);
    for (let i = 0; i < pending.length; i += 30) {
      const part = pending.slice(i, i + 30);
      const send = part.filter((r) => r.status !== "posted");
      const ops = send.map((r, j) => ({ bId: String(j), operation: "delete" as const, entity: t.key, body: { Id: r.raw.Id, SyncToken: r.raw.SyncToken } }));
      const rid = createHash("sha256").update(id + JSON.stringify(ops)).digest("hex").slice(0, 36);
      const res = await batch(company._id, ops, rid);
      for (const row of part) {
        if (row.status === "posted") { results.push({ id: row.qbo!.id, ok: true }); continue; }
        const x = res[send.indexOf(row)];
        const ok = !!x?.ok || /object not found|not found|already deleted/i.test(x?.error || "");
        const error = /stale|syncToken/i.test(x?.error || "") ? "This record changed after you selected it. Refresh the search and review it before deleting." : x?.error;
        await R.updateOne({ jobId: id, idx: row.idx }, { $set: { status: ok ? "posted" : "failed", ...(!ok && error ? { error } : {}) }, ...(ok ? { $unset: { error: "" } } : {}) });
        results.push({ id: row.qbo!.id, ok, error: ok ? undefined : error });
      }
    }
    const posted = await R.countDocuments({ jobId: id, status: "posted" });
    const failed = await R.countDocuments({ jobId: id, status: { $ne: "posted" } });
    await J.updateOne({ _id: jobId }, { $set: { "counts.posted": posted, "counts.failed": failed, resultCount: posted + failed, updatedAt: new Date(), ...(b.last ? { status: failed ? (posted ? "partial" : "failed") : "completed", finishedAt: new Date() } : {}) } });
    if (b.last) await logActivity({ user: session.name, realmId: company._id, companyName: company.name, action: "Deleted records", detail: `${t.label}, ${posted} deleted, ${failed} not deleted`, jobId: id });
    return { jobId: id, results };
  } finally {
    try { if (companyLock) await unlockCompany(company._id, companyLock); }
    finally { await unlockJob(jobId, job.lockToken); }
  }
});

