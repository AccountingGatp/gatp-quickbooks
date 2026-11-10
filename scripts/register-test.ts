// Bank update test with a QuickBooks register export: detect, map, check, post, then import again (all duplicates).
import { readFileSync } from "fs";
import { ObjectId } from "mongodb";
import { readWorkbook } from "../lib/parse/file";
import { catalog, entityDef } from "../lib/import/entities";
import { autoMap, detectEntity } from "../lib/import/automap";
import { jobs, jobRows } from "../lib/db";
import { mockConnect } from "../lib/qbo/oauth";
import { validateJob } from "../lib/import/validate";
import { postChunk } from "../lib/import/post";
import { DEFAULT_SETTINGS } from "../lib/types";
import { toRaw } from "../lib/jobs";

const realm = "demo-eldersburg";
async function run(file: string, label: string) {
  const buf = readFileSync(file);
  const [s] = readWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, file);
  const key = detectEntity(s.name, s.headers, catalog())!;
  const def = entityDef(key);
  const mapping = autoMap(def.fields, s.headers);
  const title = s.notes[0]?.split("\t")[0].trim();
  const fixed = { bankAccount: process.env.BANK || title };
  console.log(`\n### ${label}: detected=${key} rows=${s.rows.length} headerRow=${s.headerRow} bankAccount="${title}"`);
  console.log("  mapping:", Object.entries(mapping).filter(([, h]) => h).map(([k, h]) => `${k}<-${h}`).join(", "));
  const id = new ObjectId();
  await (await jobs()).insertOne({ _id: id, kind: "import", entity: key, entityLabel: def.label, realmId: realm, companyName: "Eldersburg", user: "tester", fileName: file, headers: s.headers, mapping, fixed, settings: DEFAULT_SETTINGS, status: "review", counts: { total: 0, ready: 0, error: 0, warning: 0, skipped: 0, posted: 0, failed: 0, rolledBack: 0, transactions: 0 }, createdAt: new Date(), updatedAt: new Date() });
  await (await jobRows()).insertMany(s.rows.map((r, i) => {
    const values: Record<string, string> = {};
    for (const f of def.fields) { const h = mapping[f.key]; const v = h ? r.data[h] : (fixed as any)[f.key]; if (v != null && String(v).trim() !== "") values[f.key] = String(v).trim(); }
    return { jobId: String(id), idx: i, sheetRow: r.sheetRow, raw: toRaw(s.headers, r.data), values, group: `r:${i}`, status: "pending" as const, issues: [] };
  }));
  const v = await validateJob(String(id));
  const rows = await (await jobRows()).find({ jobId: String(id) }).sort({ idx: 1 }).toArray();
  console.log("  check:", JSON.stringify(v.counts), "new names:", v.pendingNames.map((n) => `${n.kind}:${n.name}`).join(", "));
  for (const r of rows) for (const i of r.issues) if (i.level === "error" || !/New vendor|Same date/.test(i.msg)) console.log(`   r${r.sheetRow} [${r.status}] ${i.level}: ${i.msg}`);
  const p = await postChunk(String(id), "tester");
  const after = await (await jobRows()).find({ jobId: String(id) }).toArray();
  const byType: Record<string, number> = {};
  after.filter((r) => r.status === "posted").forEach((r) => (byType[r.qbo!.type] = (byType[r.qbo!.type] || 0) + 1));
  console.log("  posted:", p.counts.posted, "failed:", p.counts.failed, "skipped:", p.counts.skipped, "status:", p.status, JSON.stringify(byType));
  after.filter((r) => r.status === "failed").forEach((r) => console.log(`   FAIL r${r.sheetRow}: ${r.error}`));
}
(async () => {
  await mockConnect("tester");
  await run(process.argv[2], "first import");
  await run(process.argv[2], "same file again");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
