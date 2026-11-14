import * as XLSX from "xlsx";
import { requireSession, route } from "@/lib/http";
import { sampleTemplate, TEMPLATE_HEADERS } from "@/lib/import/templates";

export const dynamic = "force-dynamic";
export const GET = route(async (request: Request) => {
  await requireSession();
  const type = new URL(request.url).searchParams.get("type") || "banking";
  if (type !== "banking" && !Object.hasOwn(TEMPLATE_HEADERS, type)) return Response.json({ error: "Unknown template type." }, { status: 400 });
  const bytes = XLSX.write(sampleTemplate(type), { type: "buffer", bookType: "xlsx" });
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="GATP_Sample_Template_${type}.xlsx"`,
    "Cache-Control": "private, no-store",
  } });
});
