import { audit } from "./db";

/** Activity log: who did what, in which company. Never throws (logging must not break the work). */
export async function logActivity(e: { user: string; realmId?: string; companyName?: string; action: string; detail?: string; jobId?: string }) {
  try {
    await (await audit()).insertOne({ ...e, ts: new Date() });
  } catch (err) {
    console.error("audit log failed", err);
  }
}
