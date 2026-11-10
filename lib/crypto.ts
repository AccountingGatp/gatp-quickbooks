// AES-256-GCM encryption for QuickBooks tokens at rest (MongoDB never stores them in plain text).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function key() {
  const k = process.env.TOKEN_ENCRYPTION_KEY || "";
  if (k.length < 16) throw new Error("TOKEN_ENCRYPTION_KEY is missing or too short (use 32+ characters).");
  return createHash("sha256").update(k).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decrypt(blob: string): string {
  const [iv, tag, data] = blob.split(".");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}
