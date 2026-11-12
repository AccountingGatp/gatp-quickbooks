// History list, and starting a new import.
import { ObjectId } from "mongodb";
import { jobs } from "@/lib/db";
import { requireCompany, requireSession, route } from "@/lib/http";
import { entityDef } from "@/lib/import/entities";
import { EMPTY_COUNTS, publicJob } from "@/lib/jobs";
import { DEFAULT_SETTINGS, type JobDoc } from "@/lib/types";
import { unsupportedSheetAction } from "@/lib/import/grouping";
export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  await requireSession();
  const p = new URL(req.url).searchParams;
  const q: Record<string, unknown> = { status: { $ne: "discarded" } };
  if (p.get("realmId")) q.realmId = p.get("realmId");
  if (p.get("kind")) q.kind = p.get("kind");
  if (p.get("user")) q.user = p.get("user");
  if (p.get("status")) q.status = p.get("status");
  const limit = Math.min(Number(p.get("limit") || 50), 200);
  const skip = Number(p.get("skip") || 0);
  const J = await jobs();
  const [list, total] = await Promise.all([
    J.find(q, { projection: { headers: 0, mapping: 0, fixed: 0 } }).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    J.countDocuments(q),
  ]);
  return { jobs: list.map(publicJob), total };
});

export const POST = route(async (req: Request) => {
  const { session, company } = await requireCompany();
  const { entity, fileName, sheetName, headers, notes } = await req.json();
  const unsupported = unsupportedSheetAction(String(sheetName || ""));
  if (unsupported) throw new Error(unsupported);
  const def = entityDef(String(entity));
  if (!Array.isArray(headers) || !headers.length) throw new Error("The file has no column headers.");
  const now = new Date();
  const doc: JobDoc = {
    _id: new ObjectId(), kind: "import", entity: def.key, entityLabel: def.label, realmId: company._id, companyName: company.name,
    user: session.name, fileName: String(fileName || "file").slice(0, 200), sheetName: String(sheetName || "").slice(0, 100),
    headers: headers.map((h: unknown) => String(h)).slice(0, 300), notes: Array.isArray(notes) ? notes.map((n: unknown) => String(n).slice(0, 300)).slice(0, 6) : [], status: "mapping", counts: { ...EMPTY_COUNTS },
    settings: { ...DEFAULT_SETTINGS, ...(company.settings || {}) }, flipSign: !!def.sign?.defaultFlip, createdAt: now, updatedAt: now,
  };
  await (await jobs()).insertOne(doc);
  return { id: String(doc._id) };
});

