// "What needs fixing": the problems of an import grouped by message, with the rows each one affects.
import { jobRows } from "@/lib/db";
import { requireSession, route } from "@/lib/http";
import { getJob } from "@/lib/jobs";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: P) => {
  await requireSession();
  const job = await getJob((await params).id);
  const rows = await (await jobRows()).find({ jobId: String(job._id), status: { $in: ["error", "failed"] } }, { projection: { idx: 1, issues: 1, error: 1, status: 1 } }).toArray();
  const groups = new Map<string, { msg: string; field?: string; kind: "error" | "refused"; idxs: number[] }>();
  for (const r of rows) {
    const list = r.status === "failed" ? [{ msg: r.error || "Refused by QuickBooks", field: undefined as string | undefined, kind: "refused" as const }]
      : (r.issues || []).filter((i) => i.level === "error").map((i) => ({ msg: i.msg, field: i.field, kind: "error" as const }));
    for (const i of list) {
      const key = `${i.kind}|${i.field || ""}|${i.msg}`;
      const g = groups.get(key) || { msg: i.msg, field: i.field, kind: i.kind, idxs: [] };
      if (!g.idxs.includes(r.idx)) g.idxs.push(r.idx);
      groups.set(key, g);
    }
  }
  return { groups: [...groups.values()].sort((a, b) => b.idxs.length - a.idxs.length).slice(0, 50) };
});
