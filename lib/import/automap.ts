// Matching file columns to import fields, and guessing the import type from a sheet.
import type { CatalogEntity } from "./entities";

export const hnorm = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const signature = (headers: string[]) => [...new Set(headers.map(hnorm).filter(Boolean))].sort().join("|");

type F = { key: string; label: string; aliases?: string[] };

/** A register has two amount columns. Reusing only Deposit silently drops every payment. */
export function repairStatementMapping(entity: string, headers: string[], input: Record<string, string | null>) {
  if (!["bank-statement", "card-statement"].includes(entity)) return input;
  const byNorm = new Map(headers.map((h) => [hnorm(h), h]));
  const pair = entity === "bank-statement" ? [byNorm.get("payment"), byNorm.get("deposit")] : [byNorm.get("chargeamount") || byNorm.get("charges"), byNorm.get("paymentcreditamount") || byNorm.get("credits")];
  if (!pair[0] || !pair[1]) return input;
  // A real signed Amount column remains a valid explicit choice.
  if (input.amount && !pair.includes(input.amount)) return input;
  return { ...input, amount: null, debit: pair[0], credit: pair[1] };
}

export function statementMappingIssue(entity: string, headers: string[], input: Record<string, string | null>) {
  const repaired = repairStatementMapping(entity, headers, input);
  return repaired !== input && ["amount", "debit", "credit"].some((k) => repaired[k] !== input[k])
    ? `This statement has separate money-out and money-in columns. Match “${repaired.debit}” to Debit/Charge Amount and “${repaired.credit}” to Credit Amount; leave the single Amount field empty.`
    : null;
}

export function autoMap(fields: F[], headers: string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const used = new Set<string>();
  const byNorm = new Map(headers.map((h) => [hnorm(h), h]));
  // pass 1: exact field label; pass 2: aliases
  for (const pass of [0, 1]) {
    for (const f of fields) {
      if (out[f.key]) continue;
      const names = pass === 0 ? [f.label] : f.aliases || [];
      for (const n of names) {
        const h = byNorm.get(hnorm(n));
        if (h && !used.has(h)) { out[f.key] = h; used.add(h); break; }
      }
    }
  }
  for (const f of fields) if (!(f.key in out)) out[f.key] = null;
  return out;
}

/** Best import type for a sheet: sheet name first, then how many columns match. */
export function detectEntity(sheetName: string, headers: string[], entities: CatalogEntity[]) {
  const sn = hnorm(sheetName);
  let best: { key: string; score: number } | null = null;
  for (const e of entities) {
    let score = e.sheetNames.some((s) => hnorm(s) === sn) ? 100 : e.sheetNames.some((s) => sn.includes(hnorm(s)) && hnorm(s).length > 4) ? 30 : 0;
    const m = autoMap(e.fields, headers);
    const mapped = Object.values(m).filter(Boolean).length;
    for (const f of e.fields) if (m[f.key]) score += hnorm(m[f.key]!) === hnorm(f.label) ? 3 : 1;
    // without a matching sheet name, most of the sheet's columns must belong to this type
    const missingRequired = e.fields.some((f) => f.required === true && !m[f.key] && !["bankAccount", "ccAccount"].includes(f.key));
    if (score < 100 && (missingRequired || mapped / Math.max(1, headers.length) < 0.6)) score = 0;
    if (!best || score > best.score) best = { key: e.key, score };
  }
  return best && best.score >= 4 ? best.key : null;
}

