// Find records in QuickBooks (for Export and Delete). Returns one page at a time.
import { requireCompany, route } from "@/lib/http";
import { flatten, search, summary, type SearchFilter } from "@/lib/export";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = route(async (req: Request) => {
  const { company } = await requireCompany();
  const b = (await req.json()) as SearchFilter & { start?: number; mode?: "export" | "delete" };
  const start = Math.max(1, Number(b.start || 1));
  const PAGE = 500;
  const recs = await search(company._id, b, start, PAGE);
  return {
    next: recs.length === PAGE ? start + PAGE : null,
    count: recs.length,
    rows: b.mode === "delete" ? [] : flatten(b.type, recs),
    items: recs.map((r) => summary(b.type, r)),
    backup: b.mode === "delete" ? recs : undefined,
  };
});
