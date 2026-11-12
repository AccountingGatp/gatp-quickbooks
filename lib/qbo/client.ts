// QuickBooks Online API client, per company (realmId).
// - tokens are refreshed automatically, with a lock so two users never refresh the same company at once
// - 429 / 5xx responses are retried with back-off
// - QB_MOCK=1 routes every call to a fake QuickBooks stored in MongoDB (see mock.ts)
import { companies } from "../db";
import { decrypt, encrypt } from "../crypto";
import { mockApi } from "./mock";

export const MOCK = process.env.QB_MOCK === "1";
export const ENV: "sandbox" | "production" = process.env.QB_ENVIRONMENT === "production" ? "production" : "sandbox";
const API_BASE = ENV === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";
const APP_BASE = ENV === "production" ? "https://app.qbo.intuit.com" : "https://app.sandbox.qbo.intuit.com";
export const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const MINOR = "75";

export class QboError extends Error {
  constructor(message: string, public code?: string, public status?: number) { super(message); }
}

type Tokens = { access_token: string; refresh_token: string };

export function basicAuth() {
  const id = process.env.QB_CLIENT_ID, secret = process.env.QB_CLIENT_SECRET;
  if (!id || !secret) throw new Error("QB_CLIENT_ID / QB_CLIENT_SECRET are not set in the environment variables.");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export async function tokenRequest(body: Record<string, string>) {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new QboError(j.error_description || j.error || `Intuit login error ${r.status}`, j.error, r.status);
  return j as Tokens & { expires_in: number; x_refresh_token_expires_in: number };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Valid access token for this company. Refreshes it (once, under a lock) when it is about to expire. */
async function accessToken(realmId: string, force = false): Promise<string> {
  const c = await companies();
  for (let attempt = 0; attempt < 12; attempt++) {
    const co = await c.findOne({ _id: realmId });
    if (!co) throw new QboError("This company is not connected. Open Companies and connect it.");
    if (co.status === "needs_reconnect") throw new QboError(`The QuickBooks connection for “${co.name}” has expired. Open Companies and click Reconnect.`);
    const tokens = JSON.parse(decrypt(co.tokens)) as Tokens;
    if (!force && co.accessExpiresAt - 90_000 > Date.now()) return tokens.access_token;

    // take the refresh lock
    const now = Date.now();
    const got = await c.findOneAndUpdate(
      { _id: realmId, $or: [{ refreshLockUntil: { $exists: false } }, { refreshLockUntil: { $lt: now } }] },
      { $set: { refreshLockUntil: now + 20_000 } },
    );
    if (!got) { await sleep(700); force = false; continue; } // someone else is refreshing: wait and re-read
    try {
      const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
      await c.updateOne({ _id: realmId }, {
        $set: {
          tokens: encrypt(JSON.stringify({ access_token: t.access_token, refresh_token: t.refresh_token })),
          accessExpiresAt: Date.now() + t.expires_in * 1000,
          refreshExpiresAt: Date.now() + (t.x_refresh_token_expires_in || 8_640_000) * 1000,
          status: "connected",
        },
        $unset: { refreshLockUntil: "" },
      });
      return t.access_token;
    } catch (e) {
      const invalid = e instanceof QboError && e.code === "invalid_grant";
      await c.updateOne({ _id: realmId }, { $unset: { refreshLockUntil: "" }, ...(invalid ? { $set: { status: "needs_reconnect" as const } } : {}) });
      throw new QboError(invalid
        ? `The QuickBooks connection for “${co.name}” has expired or was disconnected in QuickBooks. Open Companies and click Reconnect.`
        : `Could not refresh the QuickBooks login: ${(e as Error).message}`);
    }
  }
  throw new QboError("QuickBooks login is busy. Try again in a few seconds.");
}

function faultMessage(j: any, status: number) {
  const e = j?.Fault?.Error?.[0] || j?.fault?.error?.[0];
  if (!e) return `QuickBooks error ${status}`;
  const msg = e.Message || e.message || "QuickBooks error";
  const detail = e.Detail || e.detail;
  let out = detail && !String(detail).startsWith(msg) ? `${msg}: ${detail}` : String(detail || msg);
  // "A business validation error has occurred while processing your request: Business Validation Error: X" -> "X"
  out = out.replace(/^A business validation error has occurred while processing your request:?\s*/i, "").replace(/^Business Validation Error:\s*/i, "");
  return out;
}

/** Raw API call: path is relative to /v3/company/{realmId}/ */
export async function api(realmId: string, path: string, opts: { body?: unknown; requestId?: string } = {}): Promise<any> {
  if (MOCK) return mockApi(realmId, path, opts.body);
  let token = await accessToken(realmId);
  const qs = new URLSearchParams({ minorversion: MINOR });
  if (opts.requestId) qs.set("requestid", opts.requestId);
  const sep = path.includes("?") ? "&" : "?";
  const url = `${API_BASE}/v3/company/${realmId}/${path}${sep}${qs}`;
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, {
      method: opts.body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(opts.body ? { "Content-Type": "application/json" } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (r.status === 401 && attempt === 0) { token = await accessToken(realmId, true); continue; }
    if ((r.status === 429 || r.status >= 500) && attempt < 4) { await sleep(1200 * (attempt + 1) ** 2); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.Fault) throw new QboError(faultMessage(j, r.status), j?.Fault?.Error?.[0]?.code, r.status);
    return j;
  }
}

export async function query(realmId: string, q: string): Promise<any> {
  return (await api(realmId, `query?query=${encodeURIComponent(q)}`)).QueryResponse || {};
}

/** All rows of an entity (pages of 1000). */
export async function queryAll(realmId: string, entity: string, where = "", limit = 100_000): Promise<any[]> {
  const out: any[] = [];
  for (let start = 1; out.length < limit; start += 1000) {
    const rows = (await query(realmId, `select * from ${entity} ${where} startposition ${start} maxresults 1000`))[entity] || [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export type BatchOp = { bId: string; operation: "create" | "update" | "delete"; entity: string; body: any };
export type BatchResult = { bId: string; ok: boolean; entity?: any; error?: string };

/** Up to 30 operations in one call. */
export async function batch(realmId: string, ops: BatchOp[], requestId?: string): Promise<BatchResult[]> {
  if (!ops.length) return [];
  if (ops.length > 30) throw new Error("A QuickBooks batch can hold at most 30 operations.");
  const j = await api(realmId, "batch", {
    requestId,
    body: { BatchItemRequest: ops.map((o) => ({ bId: o.bId, operation: o.operation, [o.entity]: o.body })) },
  });
  const res: any[] = j.BatchItemResponse || [];
  return ops.map((o) => {
    const r = res.find((x) => x.bId === o.bId);
    if (!r) return { bId: o.bId, ok: false, error: "No answer from QuickBooks for this item." };
    if (r.Fault) return { bId: o.bId, ok: false, error: faultMessage(r, 400) };
    return { bId: o.bId, ok: true, entity: r[o.entity] };
  });
}

export const escapeQ = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** Link to open a record in QuickBooks. */
export function qboLink(type: string, id: string, extra?: { paymentType?: string; credit?: boolean }) {
  if (MOCK) return "";
  const page: Record<string, string> = {
    Deposit: "deposit", Transfer: "transfer", Bill: "bill", BillPayment: "billpayment", VendorCredit: "vendorcredit",
    PurchaseOrder: "purchaseorder", Invoice: "invoice", Estimate: "estimate", SalesReceipt: "salesreceipt",
    CreditMemo: "creditmemo", RefundReceipt: "refundreceipt", Payment: "recvpayment", JournalEntry: "journal",
    TimeActivity: "timeactivity",
  };
  if (type === "Purchase") {
    const p = extra?.paymentType === "Check" ? "check" : extra?.credit ? "creditcardcredit" : "expense";
    return `${APP_BASE}/app/${p}?txnId=${id}`;
  }
  if (page[type]) return `${APP_BASE}/app/${page[type]}?txnId=${id}`;
  if (type === "Customer") return `${APP_BASE}/app/customerdetail?nameId=${id}`;
  if (type === "Vendor") return `${APP_BASE}/app/vendordetail?nameId=${id}`;
  if (type === "Employee") return `${APP_BASE}/app/employees`;
  if (type === "Item") return `${APP_BASE}/app/items`;
  if (type === "Account") return `${APP_BASE}/app/chartofaccounts`;
  return `${APP_BASE}/app/homepage`;
}

