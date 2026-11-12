import { autoMap, hnorm, repairStatementMapping } from "./automap";
import type { CatalogEntity } from "./entities";

type Mapping = Record<string, string | null>;

/** Saved mappings can contain obsolete fields. Only this type and worksheet may supply options. */
export function mappingForType(def: CatalogEntity, headers: string[], saved?: Mapping) {
  const normalised = saved && Object.fromEntries(Object.entries(saved).map(([key, h]) => {
    const matches = h ? headers.filter((header) => hnorm(header) === hnorm(h)) : [];
    return [key, h && headers.includes(h) ? h : matches.length === 1 ? matches[0] : null];
  }));
  const source = repairStatementMapping(def.key, headers, { ...autoMap(def.fields, headers), ...normalised });
  const used = new Set<string>();
  return Object.fromEntries(def.fields.map((f) => {
    const h = source[f.key];
    const valid = h && headers.includes(h) && !used.has(h) ? h : null;
    if (valid) used.add(valid);
    return [f.key, valid];
  })) as Mapping;
}

/** One file column -> one destination, one destination -> one file column. */
export function assignColumn(def: CatalogEntity, input: Mapping, header: string, field: string) {
  const out = Object.fromEntries(def.fields.map((f) => [f.key, input[f.key] === header ? null : input[f.key] || null])) as Mapping;
  if (def.fields.some((f) => f.key === field)) out[field] = header;
  return out;
}

export function repeatedSource(mapping: Mapping) {
  const seen = new Set<string>();
  for (const h of Object.values(mapping)) if (h) { if (seen.has(h)) return h; seen.add(h); }
  return null;
}
