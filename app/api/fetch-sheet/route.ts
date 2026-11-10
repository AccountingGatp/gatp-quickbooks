// Downloads a Google Sheet (shared as "Anyone with the link") so it can be imported like a file.
import { requireSession } from "@/lib/http";
import { googleSheetUrl } from "@/lib/parse/file";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireSession();
    const { url } = await req.json();
    const dl = googleSheetUrl(String(url || ""));
    if (!dl) return Response.json({ error: "That is not a Google Sheets link. It should look like https://docs.google.com/spreadsheets/d/…" }, { status: 400 });
    const r = await fetch(dl, { redirect: "follow" });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || type.includes("text/html")) return Response.json({ error: "Google did not share this sheet. In Google Sheets choose Share → General access → Anyone with the link, then try again." }, { status: 400 });
    return new Response(await r.arrayBuffer(), { headers: { "Content-Type": "application/octet-stream" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
