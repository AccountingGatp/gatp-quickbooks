// Connecting client companies. GATP's Intuit login has access to every client company, so each
// "Connect company" click opens Intuit's company picker; the chosen company is saved here (tokens encrypted).
import { companies, listCache } from "../db";
import { encrypt, decrypt } from "../crypto";
import { api, basicAuth, ENV, MOCK, tokenRequest } from "./client";
import { DEMO_COMPANIES } from "./mock";

const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

export function authorizeUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.QB_CLIENT_ID || "",
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: process.env.QB_REDIRECT_URI || "",
    state,
  });
  return `https://appcenter.intuit.com/connect/oauth2?${p}`;
}

export async function finishConnect(code: string, realmId: string, user: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: process.env.QB_REDIRECT_URI || "" });
  const c = await companies();
  const base = {
    realmId, environment: ENV,
    tokens: encrypt(JSON.stringify({ access_token: t.access_token, refresh_token: t.refresh_token })),
    accessExpiresAt: Date.now() + t.expires_in * 1000,
    refreshExpiresAt: Date.now() + (t.x_refresh_token_expires_in || 8_640_000) * 1000,
    status: "connected" as const,
  };
  await c.updateOne(
    { _id: realmId },
    { $set: base, $setOnInsert: { name: "QuickBooks company", connectedAt: new Date(), connectedBy: user } },
    { upsert: true },
  );
  const info = await api(realmId, `companyinfo/${realmId}`);
  const name = info.CompanyInfo?.CompanyName || "QuickBooks company";
  await c.updateOne({ _id: realmId }, { $set: { name, homeCurrency: info.CompanyInfo?.HomeCurrency?.value } });
  await (await listCache()).deleteMany({ realmId });
  return { realmId, name };
}

export async function disconnectCompany(realmId: string) {
  const c = await companies();
  const co = await c.findOne({ _id: realmId });
  if (co && !MOCK) {
    try {
      const { refresh_token } = JSON.parse(decrypt(co.tokens));
      await fetch(REVOKE_URL, {
        method: "POST",
        headers: { Authorization: basicAuth(), Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ token: refresh_token }),
      });
    } catch { /* already revoked */ }
  }
  await c.deleteOne({ _id: realmId });
  await (await listCache()).deleteMany({ realmId });
}

/** Demo mode: adds the fake client companies. */
export async function mockConnect(user: string) {
  const c = await companies();
  for (const d of DEMO_COMPANIES) {
    await c.updateOne({ _id: d.realmId }, {
      $set: { realmId: d.realmId, name: d.name, environment: "demo", tokens: encrypt("{}"), accessExpiresAt: 8.64e15, refreshExpiresAt: 8.64e15, status: "connected" },
      $setOnInsert: { connectedAt: new Date(), connectedBy: user },
    }, { upsert: true });
  }
}
