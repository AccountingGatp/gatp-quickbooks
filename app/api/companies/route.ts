// Connected client companies, and choosing the one this browser works in.
import { NextResponse } from "next/server";
import { companies } from "@/lib/db";
import { activeRealm, requireSession, route } from "@/lib/http";
import { COMPANY_COOKIE } from "@/lib/session";
import { disconnectCompany } from "@/lib/qbo/oauth";
import { clearLists } from "@/lib/qbo/lists";
import { MOCK } from "@/lib/qbo/client";
import { logActivity } from "@/lib/audit";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireSession();
  const list = await (await companies()).find({}, { projection: { tokens: 0 } }).sort({ name: 1 }).toArray();
  return {
    active: await activeRealm(), mock: MOCK,
    companies: list.map((c) => ({ realmId: c._id, name: c.name, environment: c.environment, status: c.status, connectedAt: c.connectedAt, connectedBy: c.connectedBy, lastUsedAt: c.lastUsedAt, refreshExpiresAt: c.refreshExpiresAt })),
  };
});

export const POST = route(async (req: Request) => {
  const s = await requireSession();
  const { action, realmId } = await req.json();
  const c = await companies();
  const co = await c.findOne({ _id: String(realmId) });
  if (!co) throw new Error("That company is not connected.");
  if (action === "select") {
    await c.updateOne({ _id: co._id }, { $set: { lastUsedAt: new Date() } });
    const res = NextResponse.json({ ok: true, name: co.name });
    res.cookies.set(COMPANY_COOKIE, co._id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 86400, path: "/" });
    return res;
  }
  if (action === "refresh-lists") { await clearLists(co._id); return { ok: true }; }
  if (action === "disconnect") {
    await disconnectCompany(co._id);
    await logActivity({ user: s.name, realmId: co._id, companyName: co.name, action: "Disconnected company" });
    const res = NextResponse.json({ ok: true });
    if ((await activeRealm()) === co._id) res.cookies.delete(COMPANY_COOKIE);
    return res;
  }
  throw new Error("Unknown action.");
});
