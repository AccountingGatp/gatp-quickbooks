// Checking an import before anything is posted. Writes, for every row: cleaned-up values,
// problems (errors block the row, warnings do not), the bank rule used, and possible duplicates.
import { ObjectId, type AnyBulkWriteOperation } from "mongodb";
import { jobRows, jobs, rules as rulesCol, companies } from "../db";
import { parseBool, parseDate, parseNumber, round2 } from "../parse/values";
import { query, escapeQ } from "../qbo/client";
import { entityDef, normType, type BuildCtx, type EntityDef, type OpenBill, type Vals } from "./entities";
import { KIND_LABEL, Resolver, norm } from "./resolver";
import { DEFAULT_SETTINGS, type Counts, type ImportSettings, type Issue, type JobDoc, type ListKind, type RowDoc, type RuleDoc } from "../types";
import { groupKey, inheritIdentity, headerIssues, unsupportedSheetAction } from "./grouping";
import { dupKey, DOC_TYPES } from "./duplicates";
import { loadPaymentLinks } from "./payment-links";
import { prepareUpdate } from "./updates";
import { loadUpdateTargets, targetsFor } from "./update-targets";
export { groupKey } from "./grouping";

export const STATEMENTS = new Set(["bank-statement", "card-statement"]);

/** Unpaid bills by vendor, for bank lines that pay a bill. Never silently ignore older bills. */
export async function loadOpenBills(realmId: string): Promise<Map<string, OpenBill[]>> {
  const out = new Map<string, OpenBill[]>();
  for (let start = 1; ; start += 1000) {
    const rows = (await query(realmId, `select * from Bill startposition ${start} maxresults 1000`)).Bill || [];
    for (const b of rows) {
      const bal = Number(b.Balance ?? 0);
      if (bal > 0.004 && b.VendorRef?.value) out.set(b.VendorRef.value, [...(out.get(b.VendorRef.value) || []), { id: String(b.Id), balance: bal, date: b.TxnDate, docNumber: b.DocNumber }]);
    }
    if (rows.length < 1000) break;
    if (start >= 99_001) throw new Error("Too many bills to match safely. Use a Bill payments file with explicit Bill No values.");
  }
  return out;
}
export const paysBills = (def: EntityDef, values: Vals[]) => def.key === "bank-statement" && values.some((v) => normType(v.type) === "BillPayment");

export function refKinds(def: EntityDef): ListKind[] {
  const k = new Set<ListKind>(["Account"]);
  for (const f of def.fields) {
    if (f.type !== "ref" || !f.ref) continue;
    if (f.ref === "Name") ["Vendor", "Customer", "Employee"].forEach((x) => k.add(x as ListKind));
    else k.add(f.ref as ListKind);
  }
  if (def.list && ["Vendor", "Customer", "Employee"].includes(def.list.kind)) ["Vendor", "Customer", "Employee"].forEach((x) => k.add(x as ListKind));
  if (def.list) k.add(def.list.kind as ListKind);
  return [...k];
}

export async function jobSettings(job: JobDoc): Promise<ImportSettings> {
  if (job.settings) return { ...DEFAULT_SETTINGS, ...job.settings };
  const co = await (await companies()).findOne({ _id: job.realmId });
  return { ...DEFAULT_SETTINGS, ...(co?.settings || {}) };
}

/** Rows of one transaction, with header fields filled down from the first row that has them. */
export function fillGroup(def: EntityDef, rows: Vals[]): Vals[] {
  if (rows.length < 2) return rows;
  const head = def.fields.filter((f) => !f.line).map((f) => f.key);
  const first: Vals = {};
  for (const k of head) { const hit = rows.find((r) => r[k] != null && r[k] !== ""); if (hit) first[k] = hit[k]; }
  return rows.map((r) => {
    const out = { ...r };
    for (const k of head) if ((out[k] == null || out[k] === "") && first[k] != null) out[k] = first[k];
    return out;
  });
}

function normalise(def: EntityDef, raw: Vals, fmt: ImportSettings["dateFormat"]): { values: Vals; issues: Issue[] } {
  const values: Vals = {};
  const issues: Issue[] = [];
  for (const f of def.fields) {
    let v = raw[f.key];
    if (v == null || String(v).trim() === "") continue;
    v = String(v).trim();
    if (f.type === "date") {
      const d = parseDate(v, fmt);
      if (!d) issues.push({ field: f.key, level: "error", msg: `${f.label} “${v}” is not a date I can read` });
      values[f.key] = d || v;
    } else if (f.type === "number") {
      const n = parseNumber(v);
      if (n == null) issues.push({ field: f.key, level: "error", msg: `${f.label} “${v}” is not a number` });
      values[f.key] = n == null ? v : String(round2(n * 1e3) / 1e3);
    } else if (f.type === "bool") {
      const b = parseBool(v);
      if (b == null) issues.push({ field: f.key, level: "warning", msg: `${f.label} “${v}” should be Yes or No — ignored` });
      else values[f.key] = String(b);
    } else {
      if (f.max && v.length > f.max) { issues.push({ field: f.key, level: "warning", msg: `${f.label} is longer than ${f.max} characters and will be cut` }); v = v.slice(0, f.max); }
      values[f.key] = v;
    }
  }
  return { values, issues };
}

function applyRules(rules: RuleDoc[], v: Vals, def: EntityDef): string | undefined {
  const amount = parseNumber(v.amount) ?? ((parseNumber(v.credit) ?? 0) - (parseNumber(v.debit) ?? 0));
  for (const r of rules) {
    if (!r.enabled) continue;
    const hay = norm(r.match.field === "payee" ? v.payee : [v.description, v.memo].filter(Boolean).join(" "));
    const t = norm(r.match.text);
    if (!t || !hay) continue;
    const ok = r.match.op === "number" ? /^[\d\s*#-]+$/.test(hay) : r.match.op === "equals" ? hay === t : r.match.op === "starts" ? hay.startsWith(t) : hay.includes(t);
    if (!ok) continue;
    const isOut = def.key === "card-statement" ? amount > 0 : amount < 0;
    if (r.match.direction === "in" && isOut) continue;
    if (r.match.direction === "out" && !isOut) continue;
    const s = r.set;
    if (s.account && !v.category) v.category = s.account;
    if (s.payee && !v.payee) v.payee = s.payee;
    // a bank's own "Debit" / "Credit" label only says which way money moved; the rule knows better
    if (s.type && (!v.type || ["Expense", "Deposit"].includes(normType(v.type)))) v.type = s.type;
    if (s.className && !v.className) v.className = s.className;
    if (s.location && !v.location) v.location = s.location;
    if (s.memo && !v.memo) v.memo = s.memo;
    return r.name;
  }
  return undefined;
}

function suggest(r: Resolver, kind: ListKind, value: string) {
  const v = norm(value);
  const words = v.split(" ").filter((w) => w.length > 2);
  let best: { name: string; s: number } | null = null;
  for (const it of r.list(kind)) {
    if (it.active === false) continue;
    const n = norm(it.full || it.name);
    let s = n.startsWith(v) || v.startsWith(n) ? 3 : 0;
    for (const w of words) if (n.includes(w)) s++;
    if (s > 0 && (!best || s > best.s)) best = { name: it.full || it.name, s };
  }
  return best ? ` Did you mean “${best.name}”?` : "";
}

const fmtMoney = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usDate = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : d || "");
const partyOf = (b: any) => b.VendorRef?.value || b.CustomerRef?.value || "";
const LABEL: Record<string, string> = { Purchase: "Expense", Deposit: "Deposit", Transfer: "Transfer", Bill: "Bill", Invoice: "Invoice", Estimate: "Estimate", SalesReceipt: "Sales receipt", CreditMemo: "Credit memo", RefundReceipt: "Refund receipt", PurchaseOrder: "Purchase order", VendorCredit: "Vendor credit", JournalEntry: "Journal entry", BillPayment: "Bill payment", Payment: "Receive payment", TimeActivity: "Time activity" };

async function chunked<T>(items: T[], n: number, fn: (part: T[]) => Promise<void>) {
  for (let i = 0; i < items.length; i += n) await fn(items.slice(i, i + n));
}

export type ValidateResult = { counts: Counts; pendingNames: { kind: string; name: string }[] };

/** Check the whole import (or only some transactions, after edits). */
export async function validateJob(jobId: string, only?: Set<string>, alreadyLocked = false): Promise<ValidateResult> {
  const J = await jobs(), Rw = await jobRows();
  const job = await J.findOne({ _id: new ObjectId(jobId) });
  if (!job) throw new Error("Import not found.");
  const unsupported = unsupportedSheetAction(job.sheetName || "", job.entity, job.operation);
  if (unsupported) throw new Error(unsupported);
  if (!alreadyLocked && (job.status === "posting" || (job.lockUntil || 0) > Date.now())) throw new Error("Wait for posting or undo to finish before checking this import again.");
  const def = entityDef(job.entity);
  const settings = await jobSettings(job);
  const r = new Resolver(job.realmId, settings);
  await r.load(refKinds(def));

  const all = await Rw.find({ jobId }).sort({ idx: 1 }).toArray();
  // 1. values from the file + fixed values; normalise; group
  const prepared = all.map((row) => {
    if (["posted", "posting", "rolled_back"].includes(row.status)) return { row, values: row.values, issues: row.issues, keep: true };
    const src: Vals = {};
    for (const f of def.fields) {
      const v = row.values?.[f.key];
      if (v != null && v !== "") src[f.key] = v;
    }
    const { values, issues } = normalise(def, src, settings.dateFormat);
    return { row, values, issues, keep: false };
  });
  const identities = inheritIdentity(def, prepared.map((p) => p.values), prepared.map((p) => p.row.status === "skipped"));
  prepared.forEach((p, i) => { if (!p.keep) p.values = identities[i]; });
  const groups = new Map<string, typeof prepared>();
  for (const p of prepared) {
    const g = groupKey(def, p.values, p.row.idx);
    p.row.group = g;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(p);
  }

  const ruleList = STATEMENTS.has(def.key) && settings.applyRules
    ? await (await rulesCol()).find({ realmId: { $in: [job.realmId, "*"] } }).sort({ order: 1 }).toArray()
    : [];

  // 2. per-group checks
  const ctx: BuildCtx = { r, settings, flip: !!job.flipSign, docs: new Map() };
  const docNeeds = new Map<string, Set<string>>();
  const built = new Map<string, { entity: string; body: any; error?: string }>();
  const ruleHits = new Map<string, number>();

  for (const [g, items] of groups) {
    if (only && !only.has(g)) continue;
    const live = items.filter((p) => !p.keep && p.row.status !== "skipped");
    if (!live.length) continue;
    const conflicts = headerIssues(def, live.map((p) => p.values));
    for (const p of live) p.issues.push(...conflicts);
    const filled = fillGroup(def, live.map((p) => p.values));
    live.forEach((p, i) => {
      p.values = filled[i];
      p.row.rule = undefined;
      p.row.dup = undefined;
      if (ruleList.length) {
        const hit = applyRules(ruleList, p.values, def);
        if (hit) { p.row.rule = hit; ruleHits.set(hit, (ruleHits.get(hit) || 0) + 1); }
      }
      // required fields
      if (job.operation !== "update" && p.values.qboId) p.issues.push({ field: "qboId", level: "error", msg: "This row contains an existing QuickBooks ID. Choose Update existing to change it; create mode cannot use exported IDs." });
      if (p.values.qboId && !/^\d+$/.test(p.values.qboId)) p.issues.push({ field: "qboId", level: "error", msg: "QuickBooks ID must be a numeric ID exported from this company." });
      for (const f of def.fields) {
        if (f.required === true && !p.values[f.key]) p.issues.push({ field: f.key, level: "error", msg: `${f.label} is required` });
      }
      const oneOf = def.fields.filter((f) => f.required === "one-of");
      if (oneOf.length && !oneOf.some((f) => p.values[f.key])) p.issues.push({ field: oneOf[0].key, level: "error", msg: `Add ${oneOf.map((f) => f.label).join(" or ")}` });
      // names -> QuickBooks records
      for (const f of def.fields) {
        if (f.type !== "ref" || !f.ref || !p.values[f.key]) continue;
        const val = p.values[f.key];
        const prefer = f.prefer || (def.key === "deposits" || def.group === "Sales" ? "Customer" : "Vendor");
        const hit = r.find(f.ref, val, prefer);
        if (hit) {
          if (hit.kind === "Account" && f.accountTypes && hit.item?.type && !f.accountTypes.includes(hit.item.type)) {
            const an = (t: string) => (/^[aeiou]/i.test(t) ? "an " : "a ") + t;
            p.issues.push({ field: f.key, level: "error", msg: `“${hit.name}” is ${an(hit.item.type)} account in QuickBooks. ${f.label} must be ${f.accountTypes.length === 1 ? an(f.accountTypes[0]) : `one of these types: ${f.accountTypes.join(", ")}`} account. ${job.mapping?.[f.key] ? `It comes from the file’s “${job.mapping[f.key]}” column; ` : ""}Pick the right one on Match columns (Change columns).` });
            continue;
          }
          if (hit.item && hit.item.active === false) p.issues.push({ field: f.key, level: "error", msg: `${KIND_LABEL[hit.kind]} “${hit.name}” is inactive in QuickBooks. Make it active, or choose another.` });
          else if (hit.isNew) p.issues.push({ field: f.key, level: "warning", msg: `New ${KIND_LABEL[hit.kind]} “${hit.name}” will be created` });
          continue;
        }
        const ck = r.canCreate(f.ref, prefer);
        if (ck) { r.markNew(ck, val); p.issues.push({ field: f.key, level: "warning", msg: `New ${KIND_LABEL[ck]} “${val}” will be created` }); }
        else {
          const kind = (f.ref === "Name" ? prefer : f.ref) as ListKind;
          p.issues.push({ field: f.key, level: "error", msg: `${f.label} “${val}” was not found in QuickBooks.${suggest(r, kind, val)}` });
        }
      }
      for (const dl of def.docLookups || []) {
        const n = p.values[dl.field];
        if (n) { if (!docNeeds.has(dl.type)) docNeeds.set(dl.type, new Set()); docNeeds.get(dl.type)!.add(n); }
      }
      // list records that already exist
      if (def.list) {
        const name = p.values[def.list.nameField] || [p.values.first, p.values.last].filter(Boolean).join(" ");
        const kinds = ["Vendor", "Customer", "Employee"].includes(def.list.kind) ? ["Vendor", "Customer", "Employee"] : [def.list.kind];
        for (const k of kinds) {
          const hit = r.find(k as ListKind, name);
          if (hit && !hit.isNew) { p.issues.push({ field: def.list.nameField, level: "error", msg: `“${name}” already exists in QuickBooks as ${/^[aeiou]/.test(KIND_LABEL[k]) ? "an" : "a"} ${KIND_LABEL[k]}` }); break; }
        }
      }
    });
  }

  // 3. bills / invoices named in payment files
  for (const [type, nums] of docNeeds) {
    const list = [...nums];
    await chunked(list, 40, async (part) => {
      const res = await query(job.realmId, `select * from ${type} where DocNumber IN (${part.map((n) => `'${escapeQ(n)}'`).join(",")}) maxresults 1000`);
      for (const t of res[type] || []) {
        const k = `${type}|${String(t.DocNumber).toLowerCase()}`;
        ctx.docs.set(k, [...(ctx.docs.get(k) || []), { id: t.Id, party: t.VendorRef?.value || t.CustomerRef?.value }]);
      }
    });
  }

  // 4. build each transaction (dry run) to catch anything QuickBooks would refuse
  const liveVals = [...groups.values()].flatMap((items) => items.filter((p) => !p.keep && p.row.status !== "skipped").map((p) => p.values));
  await loadPaymentLinks(job.realmId, liveVals, ctx);
  const targets = job.operation === "update" ? await loadUpdateTargets(job.realmId, def.key, liveVals) : [];
  const usedTargets = new Set<string>();
  if (paysBills(def, liveVals)) { ctx.openBills = await loadOpenBills(job.realmId); ctx.usedBills = new Set(); }
  for (const [g, items] of groups) {
    if (only && !only.has(g)) continue;
    const live = items.filter((p) => !p.keep && p.row.status !== "skipped");
    if (!live.length) continue;
    const vals = live.map((p) => p.values);
    for (const iss of def.check?.(vals, ctx) || []) {
      const { row, ...issue } = iss;
      (row != null ? [live[row]] : live).forEach((p) => p && p.issues.push(issue));
    }
    if (live.some((p) => p.issues.some((i) => i.level === "error"))) continue;
    try {
      const b = def.build(vals, ctx);
      if (job.operation === "update") {
        if (!vals[0].qboId && !vals[0].docNumber) throw new Error("Update existing needs a QuickBooks ID or document number and customer.");
        const u = prepareUpdate(b, targetsFor(targets, vals[0]), live[0].row.target, vals[0].syncToken);
        if (usedTargets.has(u.target.id)) throw new Error("This file targets the same existing record more than once. Keep all its lines together with the same document number and customer.");
        usedTargets.add(u.target.id);
        for (const p of live) p.row.target = u.target;
        live[0].issues.push({ level: "warning", msg: `Updates existing ${b.entity} ${u.target.id}; replaces all product/service lines. Include the complete transaction in the file.` });
      }
      built.set(g, b);
    } catch (e) {
      const msg = (e as Error).message;
      const v0 = vals[0];
      // a bank line paying a bill that is already paid may simply be the payment already in QuickBooks:
      // let the duplicate check decide before calling it an error
      if (def.key === "bank-statement" && normType(v0.type) === "BillPayment" && settings.duplicateCheck) {
        const bank = r.find("Account", v0.bankAccount);
        const amt = Math.abs(parseNumber(v0.amount) ?? ((parseNumber(v0.credit) ?? 0) - (parseNumber(v0.debit) ?? 0)));
        built.set(g, { entity: "BillPayment", body: { TxnDate: v0.date, CheckPayment: { BankAccountRef: { value: bank?.value } }, Line: [{ Amount: round2(amt) }] }, error: msg } as any);
      } else live[0].issues.push({ level: "error", msg });
    }
  }

  // 5. duplicates: already in QuickBooks, or twice in this file
  if (job.operation !== "update" && settings.duplicateCheck && !def.list && built.size) {
    const keyed = [...built.entries()].map(([g, b]) => ({ g, b, key: dupKey(b.entity, b.body) }));
    const byType = new Map<string, string[]>();
    for (const k of keyed) if (k.key && k.b.body.TxnDate) byType.set(k.b.entity, [...(byType.get(k.b.entity) || []), k.b.body.TxnDate]);
    // each QuickBooks transaction can only be the duplicate of one row (two identical bank lines need two matches)
    const existing = new Map<string, { id: string; label: string }[]>();
    for (const [type, dates] of byType) {
      const sorted = dates.sort();
      const res = await queryAllDates(job.realmId, type, sorted[0], sorted[sorted.length - 1]);
      for (const t of res) {
        const k = dupKey(type, t);
        if (k) existing.set(k, [...(existing.get(k) || []), { id: t.Id, label: `${LABEL[type]} on ${usDate(t.TxnDate)} for ${fmtMoney(Number(t.TotalAmt ?? t.Amount ?? 0))}` }]);
      }
    }
    // document numbers
    const docs = keyed.filter((k) => DOC_TYPES.has(k.b.entity) && k.b.body.DocNumber);
    const docType = new Map<string, string[]>();
    for (const d of docs) docType.set(d.b.entity, [...(docType.get(d.b.entity) || []), d.b.body.DocNumber]);
    const existingDocs = new Map<string, { id: string; label: string }>();
    for (const [type, nums] of docType) {
      await chunked([...new Set(nums)], 40, async (part) => {
        const res = await query(job.realmId, `select * from ${type} where DocNumber IN (${part.map((n) => `'${escapeQ(n)}'`).join(",")}) maxresults 1000`);
        for (const t of res[type] || []) existingDocs.set(`${type}|${String(t.DocNumber).toLowerCase()}|${partyOf(t)}`, { id: t.Id, label: `${LABEL[type]} no. ${t.DocNumber} (${usDate(t.TxnDate)})` });
      });
    }
    const seenInFile = new Map<string, number>();
    for (const k of keyed) {
      const first = groups.get(k.g)!.find((p) => !p.keep && p.row.status !== "skipped")!;
      let hit: { id: string; label: string } | undefined;
      if (k.key) hit = existing.get(k.key)?.shift();
      if (!hit && DOC_TYPES.has(k.b.entity) && k.b.body.DocNumber) {
        const party = partyOf(k.b.body);
        hit = existingDocs.get(`${k.b.entity}|${String(k.b.body.DocNumber).toLowerCase()}|${party}`)
          || (k.b.entity === "JournalEntry" ? existingDocs.get(`${k.b.entity}|${String(k.b.body.DocNumber).toLowerCase()}|`) : undefined);
      }
      if (!hit && k.b.error) { first.issues.push({ level: "error", msg: k.b.error }); continue; }
      if (hit) {
        const rowsOfTxn = groups.get(k.g)!.filter((p) => !p.keep && p.row.status !== "skipped");
        first.row.dup = { type: k.b.entity, id: hit.id, label: hit.label };
        if (rowsOfTxn.some((p) => p.row.forceInclude)) first.issues.push({ level: "warning", msg: `Possible duplicate: ${hit.label} is already in QuickBooks. You chose to post it anyway.` });
        else {
          first.issues.push({ level: "warning", msg: `Left out: looks like a duplicate of ${hit.label}, already in QuickBooks. Select it and click Include to post it anyway.` });
          rowsOfTxn.forEach((p) => { (p as any).autoSkip = true; });
        }
      }
      const fk = k.key || (k.b.body.DocNumber ? `${k.b.entity}|${k.b.body.DocNumber}|${partyOf(k.b.body)}` : null);
      if (fk && !k.g.startsWith("g:")) {
        const prev = seenInFile.get(fk);
        if (prev != null) first.issues.push({ level: "warning", msg: `Same date and amount as row ${prev} of this file. Fine if the bank really shows both.` });
        else seenInFile.set(fk, first.row.sheetRow);
      }
    }
  }

  // 6. save
  // Every line belongs to one transaction. A transaction with an invalid line has no ready lines.
  for (const items of groups.values()) {
    const live = items.filter((p) => !p.keep && p.row.status !== "skipped");
    if (live.some((p) => p.issues.some((i) => i.level === "error"))) for (const p of live) {
      if (!p.issues.some((i) => i.level === "error")) p.issues.push({ level: "error", msg: "Another line of this transaction needs fixing. The complete transaction is held back." });
    }
  }
  const ops: AnyBulkWriteOperation<RowDoc>[] = [];
  for (const p of prepared) {
    if (p.keep || (only && !only.has(p.row.group))) continue;
    const status = p.row.status === "skipped" || (p as any).autoSkip ? "skipped" : p.issues.some((i) => i.level === "error") ? "error" : "ready";
    // de-duplicate identical messages
    const seen = new Set<string>();
    const issues = p.issues.filter((i) => { const k = `${i.field}|${i.msg}`; if (seen.has(k)) return false; seen.add(k); return true; });
    ops.push({ updateOne: { filter: { _id: p.row._id }, update: { $set: { values: p.values, issues, status, group: p.row.group, rule: p.row.rule, dup: p.row.dup, ...(p.row.target ? { target: p.row.target } : {}) }, $unset: { error: "" } } } });
  }
  await chunked(ops, 500, async (part) => { await Rw.bulkWrite(part, { ordered: false }); });
  if (ruleHits.size) {
    const R = await rulesCol();
    for (const [name, n] of ruleHits) await R.updateOne({ realmId: { $in: [job.realmId, "*"] }, name }, { $inc: { hits: n } });
  }
  // columns worth showing in the grid: any field with a value or a problem in any row
  const used = new Set<string>(only ? job.fieldsUsed || [] : []);
  for (const p of prepared) {
    for (const [k, v] of Object.entries(p.values || {})) if (v != null && v !== "") used.add(k);
    for (const i of p.issues || []) if (i.field) used.add(i.field);
  }
  const counts = await recount(jobId);
  // names that will be created when posting (merged with earlier checks when only some rows were re-checked)
  const readyNames = new Set<string>();
  for (const p of prepared) if (!p.keep && p.row.status !== "skipped" && !(p as any).autoSkip && !p.issues.some((i) => i.level === "error")) {
    for (const f of def.fields) if (f.type === "ref" && f.ref && p.values[f.key]) {
      const prefer = f.prefer || (def.key === "deposits" || def.group === "Sales" ? "Customer" : "Vendor");
      const ref = r.find(f.ref, p.values[f.key], prefer);
      if (ref?.isNew) readyNames.add(`${ref.kind}|${norm(ref.name)}`);
    }
  }
  const fresh = [...r.pending.values()].filter((n) => readyNames.has(`${n.kind}|${norm(n.name)}`));
  const merged = fresh;
  await J.updateOne({ _id: job._id }, { $set: { counts, fieldsUsed: [...used], newNames: merged.slice(0, 500), validatedAt: new Date(), validationVersion: 2, updatedAt: new Date(), ...(["mapping", "review"].includes(job.status) ? { status: "review" } : {}) } });
  return { counts, pendingNames: merged };
}

async function queryAllDates(realmId: string, entity: string, from: string, to: string) {
  const out: any[] = [];
  for (let start = 1; ; start += 1000) {
    const rows = (await query(realmId, `select * from ${entity} where TxnDate >= '${from}' and TxnDate <= '${to}' startposition ${start} maxresults 1000`))[entity] || [];
    out.push(...rows);
    if (rows.length < 1000) break;
    if (out.length >= 100_000) throw new Error("Too many existing transactions to check duplicates safely. Split this import into smaller date ranges.");
  }
  return out;
}

export async function recount(jobId: string): Promise<Counts> {
  const rows = await (await jobRows()).find({ jobId }, { projection: { status: 1, issues: 1, group: 1, dup: 1 } }).toArray();
  const c: Counts = { total: rows.length, ready: 0, error: 0, warning: 0, skipped: 0, posted: 0, failed: 0, rolledBack: 0, transactions: 0, duplicate: 0 };
  const groups = new Set<string>();
  for (const r of rows) {
    if (r.status === "ready") { c.ready++; if (r.issues?.some((i) => i.level === "warning")) c.warning++; }
    else if (r.status === "error") c.error++;
    else if (r.status === "skipped") c.skipped++;
    else if (r.status === "posted") c.posted++;
    else if (r.status === "failed") c.failed++;
    else if (r.status === "rolled_back") c.rolledBack++;
    if (r.status !== "skipped") groups.add(r.group);
    if (r.dup && ["ready", "skipped", "error"].includes(r.status)) c.duplicate!++;
  }
  c.transactions = groups.size;
  return c;
}

