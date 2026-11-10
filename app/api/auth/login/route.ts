import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { SESSION_COOKIE, makeSession } from "@/lib/session";
import { logActivity } from "@/lib/audit";

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export async function POST(req: Request) {
  const { email = "", password = "", name = "" } = await req.json().catch(() => ({}));
  const E = process.env.APP_LOGIN_EMAIL || "", P = process.env.APP_PASSWORD || "";
  if (!E || !P) return NextResponse.json({ error: "Setup needed: APP_LOGIN_EMAIL and APP_PASSWORD are not set in Vercel." }, { status: 500 });
  if (!String(name).trim()) return NextResponse.json({ error: "Enter your name, so the activity log shows who did what." }, { status: 400 });
  if (!same(String(email).trim().toLowerCase(), E.toLowerCase()) || !same(String(password), P))
    return NextResponse.json({ error: "Email or password is not correct." }, { status: 401 });
  try {
    const s = await makeSession(String(name));
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, s.value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: s.maxAge, path: "/" });
    await logActivity({ user: String(name).trim(), action: "Logged in" });
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
