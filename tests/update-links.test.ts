import assert from "node:assert/strict";
import { test } from "node:test";
import { entityDef, type BuildCtx } from "../lib/import/entities";
import { Resolver } from "../lib/import/resolver";
import { DEFAULT_SETTINGS } from "../lib/types";
import { prepareUpdate, restoreUpdate } from "../lib/import/updates";
import { groupKey, unsupportedSheetAction } from "../lib/import/grouping";
import { autoMap } from "../lib/import/automap";
import { flatten } from "../lib/export";

function ctx(): BuildCtx {
  const r = new Resolver("sandbox", DEFAULT_SETTINGS);
  r.add("Account", { id: "1", name: "Checking", type: "Bank", active: true });
  r.add("Account", { id: "2", name: "Undeposited Funds", type: "Other Current Asset", subType: "UndepositedFunds", active: true });
  return { r, settings: DEFAULT_SETTINGS, flip: false, docs: new Map(), usedPayments: new Set(), depositPayments: new Map([
    ["101", { amount: 60, account: "2", customer: "A", deposited: false }],
    ["102", { amount: 40, account: "2", customer: "B", deposited: false }],
  ]) };
}
const deposit = { date: "2026-11-01", bankAccount: "Checking", category: "Undeposited Funds", credit: "100", type: "Deposit", paymentIds: "101,102" };

test("explicit payment links create a multi-payment deposit with the original amounts", () => {
  const c = ctx(), def = entityDef("bank-statement");
  assert.equal(def.check!([deposit], c).length, 0);
  const b = def.build([deposit], c);
  assert.equal(b.entity, "Deposit"); assert.equal(b.body.DepositToAccountRef.value, "1");
  assert.deepEqual(b.body.Line.map((l: any) => [l.Amount, l.LinkedTxn[0].TxnId]), [[60, "101"], [40, "102"]]);
  assert.throws(() => def.build([deposit], c), /already deposited or used/);
});

test("deposit links reject missing, repeated, mismatched and previously deposited receipts", () => {
  const def = entityDef("bank-statement");
  for (const [ids, pattern] of [["999", /not found/], ["101,101", /repeated/], ["101", /do not add up/], ["", /needs Payment IDs/]] as const) assert.throws(() => def.build([{ ...deposit, paymentIds: ids }], ctx()), pattern);
  const c = ctx(); c.depositPayments!.get("101")!.deposited = true;
  assert.throws(() => def.build([deposit], c), /already deposited/);
  const other = ctx(); other.depositPayments!.get("101")!.account = "1";
  assert.throws(() => def.build([deposit], other), /not an available/);
});

test("an explicit bill number permits a verified partial vendor payment", () => {
  const c = ctx(); c.r.add("Vendor", { id: "V", name: "Vendor", active: true });
  c.usedBills = new Set(); c.openBills = new Map([["V", [{ id: "B", docNumber: "INV-1", balance: 150, date: "2026-10-01" }]]]);
  const def = entityDef("bank-statement"), v = { bankAccount: "Checking", payee: "Vendor", type: "BillPayment", debit: "100", billNo: "INV-1" };
  const b = def.build([v], c);
  assert.equal(b.body.Line[0].Amount, 100); assert.equal(b.body.Line[0].LinkedTxn[0].TxnId, "B");
  c.usedBills.clear(); assert.throws(() => def.build([{ ...v, debit: "151" }], c), /exceeds the open balance/);
});

const original = { Id: "45", SyncToken: "3", DocNumber: "I-10", CustomerRef: { value: "C" }, Balance: 100, TotalAmt: 100, DueDate: "2026-12-01", PrivateNote: "Keep this", Line: [{ Id: "1", DetailType: "SalesItemLineDetail", Amount: 100, SalesItemLineDetail: { ItemRef: { value: "P" } } }] };
const built = { entity: "Invoice", label: "Invoice", body: { DocNumber: "I-10", CustomerRef: { value: "C" }, Line: [{ DetailType: "SalesItemLineDetail", Amount: 120, SalesItemLineDetail: { ItemRef: { value: "P" } } }] } };

test("bulk update preserves IDs and unmapped headers and saves a full original", () => {
  const u = prepareUpdate(built, [original]);
  assert.equal(u.body.Id, "45"); assert.equal(u.body.SyncToken, "3"); assert.equal(u.body.sparse, false);
  assert.equal(u.body.DueDate, original.DueDate); assert.equal(u.body.PrivateNote, "Keep this");
  assert.equal(u.body.Line[0].Amount, 120); assert.equal(u.before.Line[0].Amount, 100);
  assert.equal(u.body.TotalAmt, undefined);
  assert.equal(restoreUpdate(u.before, "45", "4").Line[0].Amount, 100);
});

test("bulk update never creates missing or ambiguous targets or overwrites a newer version", () => {
  assert.throws(() => prepareUpdate(built, []), /never creates/);
  assert.throws(() => prepareUpdate(built, [original, { ...original, Id: "46" }]), /Several existing/);
  assert.throws(() => prepareUpdate(built, [original], { id: "45", type: "Invoice", syncToken: "2" }), /changed after review/);
  assert.throws(() => prepareUpdate(built, [original], undefined, "2"), /out of date/);
  assert.throws(() => prepareUpdate({ ...built, body: { ...built.body, DocNumber: "I-11" } }, [original]), /cannot renumber/);
});

test("bulk update holds paid, applied, taxed and complex documents", () => {
  for (const existing of [{ ...original, Balance: 0 }, { ...original, LinkedTxn: [{ TxnId: "P", TxnType: "Payment" }] }, { ...original, TxnTaxDetail: { TotalTax: 10 } }, { ...original, Line: [{ DetailType: "GroupLineDetail" }] }]) assert.throws(() => prepareUpdate(built, [existing]), /blocked|directly in QuickBooks/);
  assert.throws(() => prepareUpdate({ ...built, entity: "CreditMemo" }, [{ ...original, RemainingCredit: 50 }]), /blocked/);
});

test("modification sheets require explicit update mode and conversion stays blocked", () => {
  assert(unsupportedSheetAction("Modify - Invoices", "invoices", "create"));
  assert.equal(unsupportedSheetAction("Modify - Invoices", "invoices", "update"), null);
  assert(unsupportedSheetAction("Modify - Bills", "bills", "update"));
  assert(unsupportedSheetAction("Type Chg - Inv to CN", "credit-memos", "update"));
});

test("exported invoices retain version and line columns that map back into update mode", () => {
  const rows = flatten("Invoice", [original]), def = entityDef("invoices");
  const mapping = autoMap(def.fields, Object.keys(rows[0]));
  assert.equal(rows[0].SyncToken, "3");
  assert.equal(mapping.qboId, "Id"); assert.equal(mapping.syncToken, "SyncToken");
  assert.equal(mapping.customer, "Customer"); assert.equal(mapping.item, "Line Product/Service");
  assert.equal(mapping.amount, "Line Amount");
  assert.equal(groupKey(def, { qboId: "45", customer: "C" }, 0), groupKey(def, { qboId: "45", customer: "C" }, 1));
});
