import { db } from "@/lib/db";
import { requireSession, route } from "@/lib/http";
import { ENV, MOCK } from "@/lib/qbo/client";
export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  await requireSession();
  let dbOk = true, dbError = "";
  try { await (await db()).command({ ping: 1 }); } catch (e) { dbOk = false; dbError = (e as Error).message; }
  const origin = new URL(req.url).origin;
  return {
    db: { ok: dbOk, error: dbError, name: process.env.MONGODB_DB || "gatp_ledger" },
    qbo: { environment: MOCK ? "demo" : ENV, clientId: !!process.env.QB_CLIENT_ID, redirectUri: process.env.QB_REDIRECT_URI || "" },
    urls: { redirect: `${origin}/api/qbo/callback`, launch: origin, disconnect: `${origin}/companies`, privacy: `${origin}/privacy`, terms: `${origin}/terms` },
    secrets: { session: (process.env.SESSION_SECRET || "").length >= 32, tokens: (process.env.TOKEN_ENCRYPTION_KEY || "").length >= 32 },
  };
});
