// Matching file columns to import fields, and guessing the import type from a sheet.
import type { CatalogEntity } from "./entities";

export const hnorm = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const signature = (headers: string[]) => [...new Set(headers.map(hnorm).filter(Boolean))].sort().join("|");

type F = { key: string; label: string; aliases?: string[] };

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
