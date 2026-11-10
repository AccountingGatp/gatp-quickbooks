// Names from the active company, for the pick-lists on the mapping and review screens.
import { requireCompany, route } from "@/lib/http";
import { getList } from "@/lib/qbo/lists";
import type { ListKind } from "@/lib/types";
export const dynamic = "force-dynamic";
const KINDS: ListKind[] = ["Account", "Vendor", "Customer", "Employee", "Item", "Class", "Department", "PaymentMethod", "Term"];

export const GET = route(async (req: Request) => {
  const { company } = await requireCompany();
  const want = (new URL(req.url).searchParams.get("kinds") || KINDS.join(",")).split(",").filter((k): k is ListKind => KINDS.includes(k as ListKind));
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const out: Record<string, { name: string; type?: string }[]> = {};
  for (const k of want) {
    const items = await getList(company._id, k, fresh);
    out[k] = items.filter((i) => i.active !== false).map((i) => ({ name: i.full || i.name, ...(k === "Account" ? { type: i.type, number: i.number } : {}) }));
  }
  return out;
});
