import { DEFAULT_SETTINGS, type ImportSettings } from "../types";
import type { EntityDef, Vals } from "./entities";

/** Whitelist settings; a string such as "false" must never enable an accounting action. */
export function importSettings(input: Partial<ImportSettings> = {}, base = DEFAULT_SETTINGS): ImportSettings {
  const out = { ...DEFAULT_SETTINGS };
  for (const source of [base, input]) for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof ImportSettings)[]) {
    if (key === "dateFormat") {
      if (["auto", "MDY", "DMY", "YMD"].includes(String(source[key]))) out.dateFormat = source[key]!;
    } else if (typeof source[key] === "boolean") (out as any)[key] = source[key];
  }
  return out;
}

/** Balanced journals are not zero-value transactions: compare their gross lines instead. */
export function isZeroTransaction(def: EntityDef, rows: Vals[]) {
  if (def.list || !rows.length) return false;
  const amounts = rows.map((v) => {
    if (v.amount != null && v.amount !== "") return Number(v.amount);
    if (v.debit != null || v.credit != null) {
      if (["bank-statement", "card-statement"].includes(def.key) && Number(v.debit || 0) !== 0 && Number(v.credit || 0) !== 0) return NaN;
      return Number(v.credit || 0) - Number(v.debit || 0);
    }
    if (v.qty != null && v.rate != null) return Number(v.qty) * Number(v.rate);
    return NaN;
  });
  if (amounts.some((v) => !Number.isFinite(v))) return false;
  return ["journal-entries", "trial-balance"].includes(def.key) ? amounts.every((v) => v === 0) : Math.abs(amounts.reduce((a, b) => a + b, 0)) < 0.005;
}
