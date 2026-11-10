// Saved column mappings: a file with the same columns as before is matched automatically.
import { mappings } from "@/lib/db";
import { activeRealm, requireSession, route } from "@/lib/http";
import { signature } from "@/lib/import/automap";
export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  await requireSession();
  const { headers, entity } = await req.json();
  const sig = signature(headers || []);
  const realm = await activeRealm();
  const M = await mappings();
  const q = entity ? { signature: sig, entity } : { signature: sig };
  const all = await M.find(q).sort({ updatedAt: -1 }).toArray();
  const hit = all.find((m) => m.realmId === realm) || all.find((m) => !m.realmId) || null;
  return { mapping: hit ? { entity: hit.entity, mapping: hit.mapping, fixed: hit.realmId === realm ? hit.fixed || {} : {}, flipSign: !!hit.flipSign, updatedBy: hit.updatedBy, updatedAt: hit.updatedAt } : null };
});
