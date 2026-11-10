// Bulk delete. The browser downloads a backup first; the full records are also kept in MongoDB.
import { ObjectId } from "mongodb";
import { jobs, jobRows } from "@/lib/db";
import { requireCompany, route } from "@/lib/http";
import { batch, query } from "@/lib/qbo/client";
import { QB_TYPE } from "@/lib/export";
import { EMPTY_COUNTS } from "@/lib/jobs";
import { logActivity } from "@/lib/audit";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** body: { jobId?, type, records: [full QuickBooks records], filter } -> deletes up to 60 per call */
export const POST = route(async (req: Request) => {
  const { session, company } = await requireCompany();
  const b = await req.json();
  const t = QB_TYPE.get(String(b.type));
  if (!t?.deletable) throw new Error("This kind of record cannot be deleted here.");
  const recs: any[] = (b.records || []).slice(0, 60);
  const J = await jobs(), R = await jobRows();
  let jobId = b.jobId ? new ObjectId(String(b.jobId)) : null;
  if (!jobId) {
    jobId = new ObjectId();
    await J.insertOne({ _id: jobId, kind: "delete", entity: t.key, entityLabel: t.label, realmId: company._id, companyName: company.name, user: session.name, status: "posting", counts: { ...EMPTY_COUNTS, total: Number(b.total || recs.length) }, filter: b.filter, createdAt: new Date(), updatedAt: new Date() });
    await logActivity({ user: session.name, realmId: company._id, companyName: company.name, action: "Started bulk delete", detail: `${t.label}, ${b.total || recs.length} records`, jobId: String(jobId) });
  }
  const id = String(jobId);
  const start = await R.countDocuments({ jobId: id });
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (let i = 0; i < recs.length; i += 30) {
    const part = recs.slice(i, i + 30);
    let res = await batch(company._id, part.map((r, j) => ({ bId: String(j), operation: "delete", entity: t.key, body: { Id: r.Id, SyncToken: r.SyncToken } })));
    const stale = part.map((r, j) => ({ r, j })).filter(({ j }) => !res[j].ok && /stale/i.test(res[j].error || ""));
    for (const { r, j } of stale) {
      const cur = (await query(company._id, `select * from ${t.key} where Id = '${r.Id}'`))[t.key]?.[0];
      if (cur) res[j] = (await batch(company._id, [{ bId: "0", operation: "delete", entity: t.key, body: { Id: r.Id, SyncToken: cur.SyncToken } }]))[0];
    }
    part.forEach((r, j) => results.push({ id: String(r.Id), ok: res[j].ok, error: res[j].error }));
  }
  await R.insertMany(recs.map((r, i) => {
    const res = results.find((x) => x.id === String(r.Id));
    return { jobId: id, idx: start + i, sheetRow: start + i + 1, raw: r, values: { id: String(r.Id), date: r.TxnDate || "", number: r.DocNumber || "", total: String(r.TotalAmt ?? r.Amount ?? "") }, group: `r:${start + i}`, status: res?.ok ? "posted" as const : "failed" as const, issues: [], error: res?.error, qbo: { type: t.key, id: String(r.Id) } };
  }));
  const ok = results.filter((x) => x.ok).length;
  const J2 = await J.findOneAndUpdate({ _id: jobId }, { $inc: { "counts.posted": ok, "counts.failed": results.length - ok, resultCount: results.length }, $set: { updatedAt: new Date() } }, { returnDocument: "after" });
  if (b.last && J2) {
    const status = J2.counts.failed === 0 ? "completed" : J2.counts.posted === 0 ? "failed" : "partial";
    await J.updateOne({ _id: jobId }, { $set: { status, finishedAt: new Date() } });
    await logActivity({ user: session.name, realmId: company._id, companyName: company.name, action: "Deleted records", detail: `${t.label}, ${J2.counts.posted} deleted${J2.counts.failed ? `, ${J2.counts.failed} could not be deleted` : ""}`, jobId: id });
  }
  return { jobId: id, results };
});
