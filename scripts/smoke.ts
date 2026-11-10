// Engine test: every sheet of the SaasAnt template -> auto-map -> check -> post (fake QuickBooks) -> undo.
import { readFileSync } from "fs";
import { ObjectId } from "mongodb";
import { readWorkbook } from "../lib/parse/file";
import { catalog, entityDef } from "../lib/import/entities";
import { autoMap, detectEntity } from "../lib/import/automap";
import { jobs, jobRows } from "../lib/db";
import { mockConnect } from "../lib/qbo/oauth";
import { validateJob } from "../lib/import/validate";
import { postChunk, rollbackChunk } from "../lib/import/post";
import { DEFAULT_SETTINGS } from "../lib/types";

const file = process.argv[2];
const only = process.argv[3];
(async () => {
  await mockConnect("tester");
  const buf = readFileSync(file);
  const sheets = readWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, file);
  const cat = catalog();
  for (const s of sheets) {
    const key = detectEntity(s.name, s.headers, cat);
    if (only && key !== only) continue;
    if (!key) { console.log(`\n### ${s.name}: no import type detected`); continue; }
    const def = entityDef(key);
    const mapping = autoMap(def.fields, s.headers);
    const unmapped = s.headers.filter((h) => !Object.values(mapping).includes(h));
    const id = new ObjectId();
    await (await jobs()).insertOne({ _id: id, kind: "import", entity: key, entityLabel: def.label, realmId: "demo-lxp", companyName: "LXP", user: "tester", fileName: "template.xlsx", sheetName: s.name, headers: s.headers, mapping, fixed: key === "bank-statement" ? { bankAccount: "Checking" } : {}, flipSign: !!def.sign?.defaultFlip, settings: DEFAULT_SETTINGS, status: "review", counts: { total: 0, ready: 0, error: 0, warning: 0, skipped: 0, posted: 0, failed: 0, rolledBack: 0, transactions: 0 }, createdAt: new Date(), updatedAt: new Date() });
    const fixed: Record<string, string> = key === "bank-statement" ? { bankAccount: "Checking" } : {};
    await (await jobRows()).insertMany(s.rows.map((r, i) => {
      const values: Record<string, string> = {};
      for (const f of def.fields) { const h = mapping[f.key]; const v = h ? r.data[h] : fixed[f.key]; if (v != null && String(v).trim() !== "") values[f.key] = String(v).trim(); }
      return { jobId: String(id), idx: i, sheetRow: r.sheetRow, raw: r.data, values, group: `r:${i}`, status: "pending" as const, issues: [] };
    }));
    const v = await validateJob(String(id));
    const rows = await (await jobRows()).find({ jobId: String(id) }).toArray();
    const errs = rows.flatMap((r) => r.issues.filter((i) => i.level === "error").map((i) => `r${r.sheetRow}: ${i.msg}`));
    const warns = rows.flatMap((r) => r.issues.filter((i) => i.level === "warning").map((i) => `r${r.sheetRow}: ${i.msg}`));
    let p = await postChunk(String(id), "tester");
    const after = await (await jobRows()).find({ jobId: String(id) }).toArray();
    const fails = after.filter((r) => r.status === "failed").map((r) => `r${r.sheetRow}: ${r.error}`);
    console.log(`\n### ${s.name} -> ${key}  rows=${s.rows.length} txns=${v.counts.transactions} ready=${v.counts.ready} err=${v.counts.error} | posted=${p.counts.posted} failed=${p.counts.failed} status=${p.status}`);
    if (unmapped.length) console.log("  unmapped:", unmapped.join(" | "));
    errs.slice(0, 6).forEach((e) => console.log("  ERR", e));
    warns.slice(0, 4).forEach((e) => console.log("  warn", e));
    fails.slice(0, 6).forEach((e) => console.log("  FAIL", e));
    if (p.counts.posted) { const rb = await rollbackChunk(String(id), "tester"); console.log(`  undo: ${rb.status} rolledBack=${rb.counts.rolledBack}${rb.message ? " msg=" + rb.message : ""}`); }
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
