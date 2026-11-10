import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireSession } from "@/lib/http";
import { authorizeUrl, mockConnect } from "@/lib/qbo/oauth";
import { MOCK } from "@/lib/qbo/client";
import { logActivity } from "@/lib/audit";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await requireSession().catch(() => null);
  if (!s) return NextResponse.redirect(new URL("/login", req.url));
  if (MOCK) {
    await mockConnect(s.name);
    await logActivity({ user: s.name, action: "Connected demo companies" });
    return NextResponse.redirect(new URL("/companies?connected=demo", req.url));
  }
  if (!process.env.QB_CLIENT_ID || !process.env.QB_REDIRECT_URI)
    return NextResponse.redirect(new URL("/companies?error=" + encodeURIComponent("QB_CLIENT_ID and QB_REDIRECT_URI are not set in Vercel."), req.url));
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("qb_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return res;
}
