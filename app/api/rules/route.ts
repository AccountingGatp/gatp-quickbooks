// Bank rules: "description contains X" -> account / payee / type / class, applied to statement rows.
import { ObjectId } from "mongodb";
import { rules } from "@/lib/db";
import { activeRealm, requireSession, route } from "@/lib/http";
import { logActivity } from "@/lib/audit";
import type { RuleDoc } from "@/lib/types";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireSession();
  const realm = await activeRealm();
  const list = await (await rules()).find({ realmId: { $in: [realm || "-", "*"] } }).sort({ order: 1, name: 1 }).toArray();
  return { rules: list.map((r) => ({ ...r, _id: String(r._id) })) };
});

export const POST = route(async (req: Request) => {
  const s = await requireSession();
  const realm = await activeRealm();
  const b = await req.json();
  const R = await rules();
  if (b.action === "delete") {
    await R.deleteOne({ _id: new ObjectId(String(b.id)) });
    await logActivity({ user: s.name, realmId: realm || undefined, action: "Deleted bank rule", detail: b.name });
    return { ok: true };
  }
  if (b.action === "reorder") {
    for (const [i, id] of (b.ids as string[]).entries()) await R.updateOne({ _id: new ObjectId(id) }, { $set: { order: i } });
    return { ok: true };
  }
  const text = String(b.match?.text || "").trim();
  if (!text) throw new Error("Enter the text to look for.");
  if (!b.set || !Object.values(b.set).some((v) => String(v || "").trim())) throw new Error("Choose at least one thing the rule fills in (for example the account).");
  const doc: Omit<RuleDoc, "_id"> = {
    realmId: b.allCompanies ? "*" : realm || "*",
    name: String(b.name || text).trim().slice(0, 80),
    order: Number(b.order ?? 999), enabled: b.enabled !== false,
    match: { field: b.match.field === "payee" ? "payee" : "description", op: ["contains", "starts", "equals"].includes(b.match.op) ? b.match.op : "contains", text, direction: ["in", "out"].includes(b.match.direction) ? b.match.direction : "any" },
    set: Object.fromEntries(Object.entries(b.set as Record<string, string>).map(([k, v]) => [k, String(v || "").trim()]).filter(([, v]) => v)),
    updatedAt: new Date(), updatedBy: s.name,
  };
  if (b.id) await R.updateOne({ _id: new ObjectId(String(b.id)) }, { $set: doc });
  else await R.insertOne({ ...doc, hits: 0 } as RuleDoc);
  await logActivity({ user: s.name, realmId: realm || undefined, action: b.id ? "Changed bank rule" : "Added bank rule", detail: doc.name });
  return { ok: true };
});
