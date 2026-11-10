// API route helpers: readable JSON errors, session + active company from cookies.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COMPANY_COOKIE, SESSION_COOKIE, readSession, type Session } from "./session";
import { companies } from "./db";
import type { CompanyDoc } from "./types";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function route<A extends unknown[]>(fn: (...a: A) => Promise<unknown>) {
  return async (...a: A) => {
    try {
      const out = await fn(...a);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 400;
      if (!(e instanceof HttpError)) console.error(e);
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
    }
  };
}

export async function requireSession(): Promise<Session> {
  const s = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) throw new HttpError(401, "Your session has ended. Log in again.");
  return s;
}

/** The company this browser is working in (set with the company switcher). */
export async function requireCompany(): Promise<{ session: Session; company: CompanyDoc }> {
  const session = await requireSession();
  const realmId = (await cookies()).get(COMPANY_COOKIE)?.value;
  if (!realmId) throw new HttpError(409, "Choose a client company first (top of the page).");
  const company = await (await companies()).findOne({ _id: realmId });
  if (!company) throw new HttpError(409, "This company is no longer connected. Choose another company or connect it again.");
  return { session, company };
}

export async function activeRealm(): Promise<string | null> {
  return (await cookies()).get(COMPANY_COOKIE)?.value || null;
}
