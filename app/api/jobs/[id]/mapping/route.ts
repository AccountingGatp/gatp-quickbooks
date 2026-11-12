// Apply the column mapping (and fixed values / options), then check every row.
import { mappings, jobRows, jobs } from "@/lib/db";
import { requireSession, route } from "@/lib/http";
import { getJob } from "@/lib/jobs";
import { entityDef } from "@/lib/import/entities";
import { signature } from "@/lib/import/automap";
import { validateJob } from "@/lib/import/validate";
import { logActivity } from "@/lib/audit";
import { DEFAULT_SETTINGS, type ImportSettings } from "@/lib/types";
import { lockJob, unlockJob } from "@/lib/import/post";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type P = { params: Promise<{ id: string }> };

export const PUT = route(async (req: Request, { params }: P) => {
  const s = await requireSession();
  const found = await getJob((await params).id);
  const job = await lockJob(found._id, s.name);
  try {
  const nothingPosted = (job.counts?.posted || 0) === 0 && ["failed", "partial"].includes(job.status);
  if (!["mapping", "review"].includes(job.status) && !nothingPosted) throw new Error("Part of this import is already in QuickBooks, so its columns can no longer change. Fix rows in the grid instead.");
  const body = (await req.json()) as { mapping: Record<string, string | null>; fixed?: Record<string, string>; flipSign?: boolean; settings?: Partial<ImportSettings>; entity?: string };
  const def = entityDef(body.entity || job.entity);
  const headers = new Set(job.headers || []);
  const mapping: Record<string, string | null> = {};
  for (const f of def.fields) { const h = body.mapping?.[f.key]; mapping[f.key] = h && headers.has(h) ? h : null; }
  const fixed: Record<string, string> = {};
  for (const f of def.fields) { const v = String(body.fixed?.[f.key] ?? "").trim(); if (v) fixed[f.key] = v; }
  if (!def.fields.some((f) => mapping[f.key])) throw new Error("Match at least one column to a field.");
  // a bank / card account can never come from the same column as the line's account (category)
  for (const f of def.fields) {
    if (!f.accountTypes || !mapping[f.key]) continue;
    const clash = def.fields.find((g) => g.key !== f.key && g.ref === "Account" && !g.accountTypes && mapping[g.key] === mapping[f.key]);
    if (clash) throw new Error(`The “${mapping[f.key]}” column can’t be both ${f.label} and ${clash.label}. In a QuickBooks register it is the other side of each line; set ${f.label} to “Not in the file” and pick the account on the right.`);
  }
  const settings = { ...DEFAULT_SETTINGS, ...(job.settings || {}), ...(body.settings || {}) };

  // compute every row's values from the file
  const R = await jobRows();
  const jobId = String(job._id);
  const cursor = R.find({ jobId, status: { $nin: ["posted", "rolled_back"] } }, { projection: { _id: 1, raw: 1, status: 1 } });
  let ops: any[] = [];
  for await (const r of cursor) {
    const values: Record<string, string> = {};
    for (const f of def.fields) {
      const h = mapping[f.key];
      const col = h ? (job.headers || []).indexOf(h) : -1;
      let v: unknown = col >= 0 ? r.raw?.["c" + col] : undefined;
      if (v == null || String(v).trim() === "") v = fixed[f.key];
      if (v != null && String(v).trim() !== "") values[f.key] = typeof v === "number" ? String(Math.round(v * 1e6) / 1e6) : String(v).trim();
    }
    ops.push({ updateOne: { filter: { _id: r._id }, update: { $set: { values, issues: [], status: r.status === "skipped" ? "skipped" : "pending" }, $unset: { error: "", requestId: "" } } } });
    if (ops.length >= 500) { await R.bulkWrite(ops, { ordered: false }); ops = []; }
  }
  if (ops.length) await R.bulkWrite(ops, { ordered: false });

  await (await jobs()).updateOne({ _id: job._id }, { $set: { entity: def.key, entityLabel: def.label, mapping, fixed, flipSign: !!body.flipSign, settings, status: "review", updatedAt: new Date() }, $unset: { finishedAt: "" } });

  // remember this mapping for files with the same columns (fixed values only for this company)
  const sig = signature(job.headers || []);
  const M = await mappings();
  const now = new Date();
  await M.updateOne({ entity: def.key, signature: sig, realmId: { $exists: false } }, { $set: { mapping, flipSign: !!body.flipSign, name: job.fileName || def.label, updatedAt: now, updatedBy: s.name } }, { upsert: true });
  await M.updateOne({ entity: def.key, signature: sig, realmId: job.realmId }, { $set: { mapping, fixed, flipSign: !!body.flipSign, name: job.fileName || def.label, updatedAt: now, updatedBy: s.name } }, { upsert: true });

  const res = await validateJob(jobId, undefined, true);
  if (job.status === "mapping") await logActivity({ user: s.name, realmId: job.realmId, companyName: job.companyName, action: "Uploaded file", detail: `${def.label}, ${job.fileName}, ${res.counts.total} rows`, jobId });
  return res;
  } finally { await unlockJob(job._id, job.lockToken); }
});

