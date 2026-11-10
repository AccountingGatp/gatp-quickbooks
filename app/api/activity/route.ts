import { audit } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { activeRealm } from "@/lib/http";
import { requireSession, route } from "@/lib/http";
export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  await requireSession();
  const p = new URL(req.url).searchParams;
  const q: Record<string, unknown> = {};
  if (p.get("realmId")) q.realmId = p.get("realmId");
  if (p.get("user")) q.user = p.get("user");
  const limit = Math.min(Number(p.get("limit") || 100), 500), skip = Number(p.get("skip") || 0);
  const A = await audit();
  const [list, total] = await Promise.all([A.find(q).sort({ ts: -1 }).skip(skip).limit(limit).toArray(), A.countDocuments(q)]);
  return { activity: list.map((a) => ({ ...a, _id: String(a._id) })), total };
});

/** Log something that happened in the browser (e.g. an export was downloaded). */
export const POST = route(async (req: Request) => {
  const s = await requireSession();
  const { action, detail, companyName } = await req.json();
  await logActivity({ user: s.name, realmId: (await activeRealm()) || undefined, companyName, action: String(action).slice(0, 80), detail: String(detail || "").slice(0, 300) });
  return { ok: true };
});
