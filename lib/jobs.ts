// Small helpers shared by the import API routes.
import { ObjectId } from "mongodb";
import { jobs } from "./db";
import { HttpError } from "./http";
import type { Counts, JobDoc } from "./types";

export const EMPTY_COUNTS: Counts = { total: 0, ready: 0, error: 0, warning: 0, skipped: 0, posted: 0, failed: 0, rolledBack: 0, transactions: 0 };

export async function getJob(id: string): Promise<JobDoc> {
  if (!ObjectId.isValid(id)) throw new HttpError(404, "Import not found.");
  const j = await (await jobs()).findOne({ _id: new ObjectId(id) });
  if (!j) throw new HttpError(404, "Import not found.");
  return j;
}

export function publicJob(j: JobDoc) {
  const { lockUntil, ...rest } = j;
  return { ...rest, _id: String(j._id), busy: !!lockUntil && lockUntil > Date.now() };
}

// Row data is stored by column position ("c0", "c1", …), because column titles such as "Ref No." or "$ Amount"
// are not valid MongoDB field names.
export const toRaw = (headers: string[], data: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  headers.forEach((h, i) => { if (data[h] != null && data[h] !== "") out["c" + i] = data[h]; });
  return out;
};
export const fromRaw = (headers: string[], raw: Record<string, unknown> = {}) => {
  const out: Record<string, unknown> = {};
  headers.forEach((h, i) => { if (raw["c" + i] != null) out[h] = raw["c" + i]; });
  return out;
};
