// Numbers for the dashboard (last 30 days).
import { jobs, companies, audit } from "@/lib/db";
import { activeRealm, requireSession, route } from "@/lib/http";
export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  await requireSession();
  const scope = new URL(req.url).searchParams.get("scope") || "company";
  const realm = await activeRealm();
  const since = new Date(Date.now() - 30 * 864e5);
  const q: Record<string, unknown> = { createdAt: { $gte: since }, status: { $ne: "discarded" } };
  if (scope === "company" && realm) q.realmId = realm;
  const [list, cos, recent] = await Promise.all([
    (await jobs()).find(q, { projection: { headers: 0, mapping: 0, fixed: 0, settings: 0 } }).sort({ createdAt: -1 }).limit(2000).toArray(),
    (await companies()).find({}, { projection: { name: 1, status: 1, refreshExpiresAt: 1, lastUsedAt: 1 } }).toArray(),
    (await audit()).find(scope === "company" && realm ? { realmId: realm } : {}).sort({ ts: -1 }).limit(12).toArray(),
  ]);
  const imports = list.filter((j) => j.kind === "import");
  const days: Record<string, number> = {};
  for (let i = 13; i >= 0; i--) days[new Date(Date.now() - i * 864e5).toISOString().slice(0, 10)] = 0;
  for (const j of imports) { const d = new Date(j.createdAt).toISOString().slice(0, 10); if (d in days) days[d] += j.counts?.posted || 0; }
  const soon = Date.now() + 14 * 864e5;
  return {
    imports: imports.length,
    rowsPosted: imports.reduce((s, j) => s + (j.counts?.posted || 0), 0),
    needsAttention: list.filter((j) => ["review", "posting", "partial", "failed"].includes(j.status)).length,
    deleted: list.filter((j) => j.kind === "delete").reduce((s, j) => s + (j.counts?.posted || 0), 0),
    perDay: Object.entries(days).map(([date, rows]) => ({ date, rows })),
    open: list.filter((j) => j.kind === "import" && ["review", "posting", "partial", "failed", "mapping"].includes(j.status)).slice(0, 6).map((j) => ({ _id: String(j._id), entityLabel: j.entityLabel, fileName: j.fileName, companyName: j.companyName, status: j.status, counts: j.counts, user: j.user, createdAt: j.createdAt })),
    companies: { total: cos.length, reconnect: cos.filter((c) => c.status === "needs_reconnect" || (c.refreshExpiresAt && c.refreshExpiresAt < soon)).map((c) => ({ realmId: c._id, name: c.name })) },
    activity: recent.map((a) => ({ ...a, _id: String(a._id) })),
  };
});
