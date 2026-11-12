// Rows of an import: upload (in chunks), read a page, and edit in the review grid.
import { jobRows, jobs } from "@/lib/db";
import { requireSession, route } from "@/lib/http";
import { fromRaw, getJob, toRaw } from "@/lib/jobs";
import { entityDef } from "@/lib/import/entities";
import { groupKey, validateJob } from "@/lib/import/validate";
import { qboLink } from "@/lib/qbo/client";
import type { RowDoc } from "@/lib/types";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type P = { params: Promise<{ id: string }> };
const MAX_ROWS = 25_000;

export const GET = route(async (req: Request, { params }: P) => {
  await requireSession();
  const job = await getJob((await params).id);
  const p = new URL(req.url).searchParams;
  const filter = p.get("filter") || "all";
  const q: Record<string, unknown> = { jobId: String(job._id) };
  if (filter === "error") q.status = { $in: ["error", "failed"] };
  else if (filter === "warning") { q.status = "ready"; q["issues.level"] = "warning"; }
  else if (filter === "duplicate") q["dup.id"] = { $exists: true };
  else if (["ready", "skipped", "posted", "failed", "rolled_back"].includes(filter)) q.status = filter;
  const only = (p.get("idxs") || "").split(",").filter(Boolean).map(Number).filter((n) => Number.isFinite(n));
  if (only.length) q.idx = { $in: only.slice(0, 5000) };
  const search = (p.get("q") || "").trim();
  const offset = Number(p.get("offset") || 0), limit = Math.min(Number(p.get("limit") || 100), 5000);
  const R = await jobRows();
  let rows: RowDoc[], total: number;
  if (search) {
    const s = search.toLowerCase();
    const all = (await R.find(q).sort({ idx: 1 }).toArray()).filter((r) => Object.values(r.values || {}).some((v) => String(v).toLowerCase().includes(s)));
    total = all.length; rows = all.slice(offset, offset + limit);
  } else {
    [rows, total] = await Promise.all([R.find(q).sort({ idx: 1 }).skip(offset).limit(limit).toArray(), R.countDocuments(q)]);
  }
  const withRaw = p.get("raw") === "1";
  return {
    total,
    rows: rows.map(({ _id, raw, ...r }) => ({
      ...r, ...(withRaw ? { raw: fromRaw(job.headers || [], raw) } : {}),
      ...(r.qbo && (r.status === "posted") ? { link: qboLink(r.qbo.type, r.qbo.id, { paymentType: r.qbo.paymentType, credit: r.qbo.credit }) } : {}),
    })),
  };
});

/** Upload a chunk of rows: { rows: [{ sheetRow, data }] } */
export const POST = route(async (req: Request, { params }: P) => {
  await requireSession();
  const job = await getJob((await params).id);
  if (job.status !== "mapping") throw new Error("Rows can only be added before the import is checked.");
  const { rows, start } = (await req.json()) as { rows: { sheetRow: number; data: Record<string, unknown> }[]; start: number };
  if (start + rows.length > MAX_ROWS) throw new Error(`One import can hold up to ${MAX_ROWS.toLocaleString()} rows. Split the file and import it in parts.`);
  const R = await jobRows();
  if (rows.length) await R.insertMany(rows.map((r, i) => ({ jobId: String(job._id), idx: start + i, sheetRow: r.sheetRow, raw: toRaw(job.headers || [], r.data || {}), values: {}, group: `r:${start + i}`, status: "pending" as const, issues: [] })), { ordered: false });
  const total = await R.countDocuments({ jobId: String(job._id) });
  await (await jobs()).updateOne({ _id: job._id }, { $set: { "counts.total": total, updatedAt: new Date() } });
  return { total };
});

/** Edits from the review grid. */
export const PATCH = route(async (req: Request, { params }: P) => {
  await requireSession();
  const job = await getJob((await params).id);
  if (!["review", "partial", "failed"].includes(job.status)) throw new Error("This import can no longer be edited.");
  const def = entityDef(job.entity);
  const body = (await req.json()) as {
    edits?: { idx: number; field: string; value: string }[];
    skip?: number[]; unskip?: number[];
    fill?: { idxs: number[]; field: string; value: string };
    skipDuplicates?: boolean;
  };
  const R = await jobRows();
  const jobId = String(job._id);
  const touched = new Set<string>();
  const editable = { status: { $in: ["pending", "ready", "error", "skipped", "failed"] as RowDoc["status"][] } };
  const apply = async (idxs: number[], change: (r: RowDoc) => Partial<RowDoc>) => {
    const rows = await R.find({ jobId, idx: { $in: idxs }, ...editable }).toArray();
    for (const r of rows) {
      touched.add(r.group);
      const set = change(r);
      if (set.values) touched.add(groupKey(def, set.values, r.idx));
      await R.updateOne({ _id: r._id }, { $set: set });
    }
  };
  const byIdx = new Map<number, Record<string, string>>();
  for (const e of body.edits || []) byIdx.set(e.idx, { ...(byIdx.get(e.idx) || {}), [e.field]: e.value });
  if (byIdx.size) await apply([...byIdx.keys()], (r) => ({ values: { ...r.values, ...byIdx.get(r.idx) }, ...(r.status === "failed" ? { status: "pending" as const } : {}) }));
  if (body.fill?.idxs?.length) await apply(body.fill.idxs, (r) => ({ values: { ...r.values, [body.fill!.field]: body.fill!.value }, ...(r.status === "failed" ? { status: "pending" as const } : {}) }));
  if (body.skip?.length) await apply(body.skip, () => ({ status: "skipped", forceInclude: false }));
  if (body.unskip?.length) await apply(body.unskip, (r) => ({ status: "pending", ...(r.dup ? { forceInclude: true } : {}) }));
  if (body.skipDuplicates) {
    const d = (await R.find({ jobId, status: "ready" }).toArray()).filter((x) => x.dup);
    await apply(d.map((x) => x.idx), () => ({ status: "skipped" }));
  }
  const res = await validateJob(jobId, touched.size ? touched : undefined);
  return res;
});
