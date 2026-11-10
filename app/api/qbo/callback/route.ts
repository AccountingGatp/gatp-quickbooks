import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/http";
import { finishConnect } from "@/lib/qbo/oauth";
import { COMPANY_COOKIE } from "@/lib/session";
import { logActivity } from "@/lib/audit";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const back = new URL("/companies", req.url);
  const fail = (m: string) => { back.searchParams.set("error", m); return NextResponse.redirect(back); };
  const s = await requireSession().catch(() => null);
  if (!s) return NextResponse.redirect(new URL("/login", req.url));
  if (p.get("error")) return fail("QuickBooks connection was cancelled.");
  if (!p.get("state") || p.get("state") !== req.cookies.get("qb_state")?.value) return fail("The connection check failed. Click Connect company again.");
  try {
    const { realmId, name } = await finishConnect(p.get("code") || "", p.get("realmId") || "", s.name);
    await logActivity({ user: s.name, realmId, companyName: name, action: "Connected company" });
    back.searchParams.set("connected", name);
    const res = NextResponse.redirect(back);
    res.cookies.delete("qb_state");
    res.cookies.set(COMPANY_COOKIE, realmId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 86400, path: "/" });
    return res;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not connect.");
  }
}
