import { query, escapeQ } from "../qbo/client";
import { UPDATE_TYPES } from "./updates";
import type { Vals } from "./entities";

export async function loadUpdateTargets(realmId: string, entity: string, values: Vals[]) {
  const type = UPDATE_TYPES[entity];
  if (!type) throw new Error("Update existing supports Invoices and Credit memos only.");
  const out = new Map<string, any>();
  for (const field of ["qboId", "docNumber"] as const) {
    const ids = [...new Set(values.filter((v) => field === "qboId" || !v.qboId).map((v) => v[field]).filter(Boolean))].filter((id) => field !== "qboId" || /^\d+$/.test(id));
    for (let i = 0; i < ids.length; i += 40) {
      const rows = (await query(realmId, `select * from ${type} where ${field === "qboId" ? "Id" : "DocNumber"} IN (${ids.slice(i, i + 40).map((id) => `'${escapeQ(id)}'`).join(",")}) maxresults 1000`))[type] || [];
      if (rows.length >= 1000) throw new Error("Too many matching records. Use explicit QuickBooks IDs.");
      for (const row of rows) out.set(String(row.Id), row);
    }
  }
  return [...out.values()];
}

export function targetsFor(records: any[], v: Vals) {
  return records.filter((r) => v.qboId ? String(r.Id) === v.qboId : String(r.DocNumber || "").toLowerCase() === String(v.docNumber || "").toLowerCase());
}
