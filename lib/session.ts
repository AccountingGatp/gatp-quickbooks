// Signed login cookie. Everyone shares one GATP login, but each browser gets its own session
// (own name, own active company), so several people can work at the same time without clashing.
export const SESSION_COOKIE = "gl_session";
export const COMPANY_COOKIE = "gl_company";
const DAYS = 7;

export type Session = { name: string; exp: number };

const enc = new TextEncoder();
async function hmac(text: string) {
  const secret = process.env.SESSION_SECRET || "";
  if (secret.length < 16) throw new Error("SESSION_SECRET is missing or too short (use 32+ characters).");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(text));
  return b64url(new Uint8Array(sig));
}
function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string) {
  return decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
}

export async function makeSession(name: string) {
  const payload: Session = { name: name.trim().slice(0, 60), exp: Date.now() + DAYS * 864e5 };
  const body = b64url(enc.encode(unescape(encodeURIComponent(JSON.stringify(payload)))));
  return { value: `${body}.${await hmac(body)}`, maxAge: DAYS * 86400 };
}

export async function readSession(value: string | undefined): Promise<Session | null> {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  try {
    if ((await hmac(body)) !== sig) return null;
    const s = JSON.parse(fromB64url(body)) as Session;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}
