// Offline parsing, mapping and payload checks. No MongoDB connection or QuickBooks writes.
// Usage: npm run test:files -- /path/to/file.xlsx [...files]
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import { readWorkbook } from "../lib/parse/file";
import { parseDate, parseNumber, parseBool } from "../lib/parse/values";
import { autoMap, detectEntity } from "../lib/import/automap";
import { catalog, entityDef, type BuildCtx, type Vals } from "../lib/import/entities";
import { groupKey, inheritIdentity, headerIssues, unsupportedSheetAction } from "../lib/import/grouping";
import { modificationSheet } from "../lib/import/updates";
import { DEFAULT_SETTINGS } from "../lib/types";

if (!process.argv[2]) throw new Error("Provide one or more spreadsheet paths.");
const hashes = new Map<string, string>();
for (const file of process.argv.slice(2)) {
  const buffer = readFileSync(file);
  const hash = createHash("sha256").update(buffer).digest("hex");
  const duplicateOf = hashes.get(hash);
  hashes.set(hash, basename(file));
  const sheets = readWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer, file);
  const results = sheets.map((sheet) => {
    const key = detectEntity(sheet.name, sheet.headers, catalog());
    const operation = modificationSheet(sheet.name) ? "update" : "create";
    const blocked = unsupportedSheetAction(sheet.name, key || undefined, operation);
    if (!key) return { sheet: sheet.name, rows: sheet.rows.length, blocked: blocked || "Unsupported transaction type" };
    const def = entityDef(key), mapping = autoMap(def.fields, sheet.headers);
    const raw = sheet.rows.map((row) => {
      const v: Vals = {};
      for (const f of def.fields) {
        const value = mapping[f.key] ? row.data[mapping[f.key]!] : undefined;
        if (value == null || String(value).trim() === "") continue;
        if (f.type === "date") v[f.key] = parseDate(value) || "INVALID DATE";
        else if (f.type === "number") v[f.key] = String(parseNumber(value));
        else if (f.type === "bool") v[f.key] = String(parseBool(value));
        else v[f.key] = String(value).trim();
      }
      if (key === "bank-statement" && !v.bankAccount) v.bankAccount = sheet.notes[0]?.split("\t")[0] || "SELECT BANK ACCOUNT";
      return v;
    });
    const values = inheritIdentity(def, raw);
    const groups = new Map<string, Vals[]>();
    values.forEach((v, i) => { const k = groupKey(def, v, i); groups.set(k, [...(groups.get(k) || []), v]); });
    const c: BuildCtx = { settings: DEFAULT_SETTINGS, flip: !!def.sign?.defaultFlip, docs: new Map(), r: {
      // Structural test doubles: actual QBO IDs, active flags, balances and permissions remain unverified.
      find: (kind: string, name?: string, prefer?: string) => name ? { value: name, name, kind: kind === "Name" ? prefer || "Vendor" : kind, item: { subType: /Undeposited Funds/i.test(name) ? "UndepositedFunds" : undefined } } : null,
      accountType: (name: string) => /card/i.test(name) ? "Credit Card" : "Bank",
    } as unknown as BuildCtx["r"] };
    let built = 0, failed = 0, total = 0;
    const reasons = new Map<string, number>();
    for (const rows of groups.values()) {
      const head = Object.fromEntries(def.fields.filter((f) => !f.line).map((f) => [f.key, rows.find((v) => v[f.key])?.[f.key]]));
      const filled = rows.map((v) => ({ ...head, ...v })) as Vals[];
      try {
        const issues = [...headerIssues(def, rows), ...(def.check?.(filled, c) || [])].filter((x) => x.level === "error");
        for (const v of filled) for (const f of def.fields) if (f.required === true && !v[f.key]) issues.push({ level: "error", msg: `${f.label} is required` });
        if (filled.some((v) => Object.values(v).includes("INVALID DATE"))) throw new Error("Invalid date");
        if (issues.length) throw new Error(issues[0].msg);
        const out = def.build(filled, c);
        built++;
        total += (out.body.Line || []).reduce((s: number, l: any) => s + Number(l.Amount || 0), 0);
      } catch (e) { failed++; const msg = (e as Error).message; reasons.set(msg, (reasons.get(msg) || 0) + 1); }
    }
    return { sheet: sheet.name, rows: sheet.rows.length, transactions: groups.size, type: key, operation, blocked, structuralPayloadsBuilt: built, needsReview: failed, payloadLineTotal: Math.round(total * 100) / 100, unmapped: sheet.headers.filter((h) => !Object.values(mapping).includes(h)), reasons: Object.fromEntries(reasons) };
  });
  console.log(JSON.stringify({ file: basename(file), duplicateOf, checks: "Offline structure only; no QuickBooks validation or posting", sheets: results }, null, 2));
}
