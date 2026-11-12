import type { EntityDef, Vals } from "./entities";
import type { Issue } from "../types";
import { modificationSheet, UPDATE_TYPES } from "./updates";

const norm = (v: unknown) => String(v ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const identityFields = (def: EntityDef) => ["vendor", "customer", "payee", "account", "apAccount"].filter((k) => def.fields.some((f) => f.key === k && !f.line));

/** Document numbers are only unique within a party/payment account, never across all vendors. */
export function groupKey(def: EntityDef, values: Vals, idx: number) {
  const doc = values.qboId ? `id:${norm(values.qboId)}` : def.groupBy ? norm(values[def.groupBy]) : "";
  return doc ? `g:${JSON.stringify([doc, ...identityFields(def).map((k) => norm(values[k]))])}` : `r:${idx}`;
}

/** Blank identity cells on continuation lines inherit the last identity for that document. */
export function inheritIdentity(def: EntityDef, values: Vals[], skipped: boolean[] = []) {
  const previous = new Map<string, Vals>();
  const fields = identityFields(def);
  return values.map((v, i) => {
    const doc = v.qboId ? `id:${norm(v.qboId)}` : def.groupBy ? norm(v[def.groupBy]) : "";
    if (!doc || skipped[i]) return v;
    const prev = previous.get(doc) || {};
    // A new explicit party starts a new document; it must not inherit another party's account.
    const party = fields.find((k) => ["vendor", "customer", "payee"].includes(k));
    const changed = party && v[party] && prev[party] && norm(v[party]) !== norm(prev[party]);
    const out = { ...v };
    for (const k of fields) if (!out[k] && !changed && prev[k]) out[k] = prev[k];
    previous.set(doc, out);
    return out;
  });
}

/** Never silently use the first date/customer/header when rows disagree. */
export function headerIssues(def: EntityDef, rows: Vals[]): Issue[] {
  return def.fields.filter((f) => !f.line && new Set(rows.map((v) => norm(v[f.key])).filter(Boolean)).size > 1)
    .map((f) => ({ field: f.key, level: "error", msg: `${f.label} differs between lines of the same transaction. Split the transactions or correct the header values.` }));
}

export function unsupportedSheetAction(name: string, entity?: string, operation?: string): string | null {
  if (modificationSheet(name) && !(operation === "update" && entity && UPDATE_TYPES[entity])) return "This sheet modifies existing QuickBooks records. Choose Update existing for Invoices or Credit memos; it cannot be posted as new transactions.";
  if (/^\s*(type\s*chg|type\s*change|convert)\b/i.test(name)) return "This sheet changes invoices to credit notes or credit notes to invoices. Transaction conversion is not supported yet; review and convert the existing records separately.";
  if (/^\s*(inventory\s*adjustments?|budgets?|general\s*ledger)\s*$/i.test(name)) return "This sheet's transaction type is not supported yet. It cannot be imported as another transaction type.";
  return null;
}
