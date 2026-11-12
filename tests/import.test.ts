import assert from "node:assert/strict";
import { test } from "node:test";
import { entityDef, type BuildCtx, type Vals } from "../lib/import/entities";
import { groupKey, inheritIdentity, headerIssues, unsupportedSheetAction } from "../lib/import/grouping";
import { dupKey, txnTotal } from "../lib/import/duplicates";
import { assertCompleteResults } from "../lib/import/batches";
import { parseDate, parseNumber } from "../lib/parse/values";
import { readWorkbook } from "../lib/parse/file";
import { DEFAULT_SETTINGS } from "../lib/types";

function context(): BuildCtx {
  return { settings: DEFAULT_SETTINGS, flip: false, docs: new Map(), r: {
    find: (kind: string, value?: string, prefer?: string) => value ? { value, name: value, kind: kind === "Name" ? prefer || "Vendor" : kind } : null,
    accountType: (id: string) => id === "Card" ? "Credit Card" : "Bank",
  } as unknown as BuildCtx["r"] };
}

test("same document number from different vendors produces separate bills", () => {
  const def = entityDef("bills");
  const rows = [{ docNumber: "1001", vendor: "A", date: "2026-11-01", category: "Supplies", amount: "100" }, { docNumber: "1001", vendor: "B", date: "2026-11-01", category: "Supplies", amount: "200" }];
  assert.notEqual(groupKey(def, rows[0], 0), groupKey(def, rows[1], 1));
  assert.equal(def.build([rows[0]], context()).body.VendorRef.value, "A");
  assert.equal(def.build([rows[1]], context()).body.Line[0].Amount, 200);
});

test("continuation lines inherit identity without mixing new vendors", () => {
  const def = entityDef("bills");
  const rows = inheritIdentity(def, [{ docNumber: "1", vendor: "A" }, { docNumber: "1" }, { docNumber: "1", vendor: "B" }, { docNumber: "1" }]);
  assert.deepEqual(rows.map((r) => r.vendor), ["A", "A", "B", "B"]);
  assert.equal(groupKey(def, rows[0], 0), groupKey(def, rows[1], 1));
  assert.notEqual(groupKey(def, rows[1], 1), groupKey(def, rows[2], 2));
});

test("conflicting dates are blocked before header fill-down", () => {
  const def = entityDef("bills");
  assert(headerIssues(def, [{ date: "2026-11-01" }, { date: "2026-11-02" }]).some((x) => x.field === "date"));
  assert.equal(headerIssues(def, [{ date: "2026-11-01" }, {}]).length, 0);
});

test("a negative card statement expense is a credit, not an additional charge", () => {
  const body = entityDef("card-statement").build([{ date: "2026-11-01", amount: "-50", type: "Expense", ccAccount: "Card", category: "Supplies" }], context()).body;
  assert.equal(body.Credit, true);
  assert.equal(body.Line[0].Amount, 50);
});

test("card payments and cash advances transfer in opposite directions", () => {
  const def = entityDef("card-statement"), c = context();
  const v = { date: "2026-11-01", type: "Transfer", ccAccount: "Card", bankAccount: "Bank" };
  const payment = def.build([{ ...v, amount: "-100" }], c).body;
  const advance = def.build([{ ...v, amount: "100" }], c).body;
  assert.equal(payment.FromAccountRef.value, "Bank");
  assert.equal(payment.ToAccountRef.value, "Card");
  assert.equal(advance.FromAccountRef.value, "Card");
  assert.equal(advance.ToAccountRef.value, "Bank");
});

test("ambiguous equal-amount bills require an explicit bill number", () => {
  const c = context();
  c.usedBills = new Set();
  c.openBills = new Map([["Vendor", [{ id: "1", balance: 100, date: "2026-01-01" }, { id: "2", balance: 100, date: "2026-02-01" }]]]);
  assert.throws(() => entityDef("bank-statement").build([{ bankAccount: "Bank", payee: "Vendor", type: "BillPayment", amount: "-100" }], c), /several unpaid bills/);
  assert.equal(c.usedBills.size, 0);
});

test("a bank payment can safely settle all remaining vendor bills", () => {
  const c = context();
  c.usedBills = new Set();
  c.openBills = new Map([["Vendor", [{ id: "1", balance: 60, date: "2026-01-01" }, { id: "2", balance: 40, date: "2026-02-01" }]]]);
  const body = entityDef("bank-statement").build([{ bankAccount: "Bank", payee: "Vendor", type: "BillPayment", amount: "-100" }], c).body;
  assert.deepEqual(body.Line.map((l: any) => l.LinkedTxn[0].TxnId), ["1", "2"]);
  assert.equal(body.Line.reduce((n: number, l: any) => n + l.Amount, 0), 100);
});

test("payment files cannot choose an arbitrary duplicate bill or invoice number", () => {
  const c = context();
  c.docs.set("Bill|1", [{ id: "1", party: "Vendor" }, { id: "2", party: "Vendor" }]);
  assert.throws(() => entityDef("bill-payments").build([{ vendor: "Vendor", account: "Bank", billNo: "1", amount: "100" }], c), /Several bills/);
  c.docs.set("Invoice|1", [{ id: "1", party: "Customer" }, { id: "2", party: "Customer" }]);
  assert.throws(() => entityDef("receive-payments").build([{ customer: "Customer", invoiceNo: "1", amount: "100" }], c), /Several invoices/);
});

test("incoming bill payments and two-sided statement lines fail validation", () => {
  const def = entityDef("bank-statement");
  assert(def.check!([{ type: "BillPayment", payee: "Vendor", amount: "100" }], context()).some((x) => x.field === "amount"));
  assert(def.check!([{ debit: "10", credit: "20", category: "Supplies" }], context()).some((x) => /Both debit/.test(x.msg)));
});

test("received-payment duplicates handle customer/date/amount and default accounts", () => {
  const p = { CustomerRef: { value: "C" }, DepositToAccountRef: { value: "Bank" }, TxnDate: "2026-11-01", TotalAmt: 100, Line: [] };
  assert.equal(txnTotal("Payment", p), 100);
  assert.equal(dupKey("Payment", p), dupKey("Payment", structuredClone(p)));
  assert.equal(dupKey("Payment", p), dupKey("Payment", { ...p, DepositToAccountRef: undefined }));
  assert.notEqual(dupKey("Payment", p), dupKey("Payment", { ...p, CustomerRef: { value: "D" } }));
  assert.notEqual(dupKey("Purchase", { ...p, Credit: true }), dupKey("Purchase", p));
});

test("missing QuickBooks results remain uncertain and must be recovered", () => {
  const ops = [{ bId: "0", operation: "create" as const, entity: "Invoice", body: {} }];
  assert.throws(() => assertCompleteResults(ops, []), /Resume/);
  assert.throws(() => assertCompleteResults(ops, [{ bId: "0", ok: true, entity: {} }]), /Resume/);
  assert.doesNotThrow(() => assertCompleteResults(ops, [{ bId: "0", ok: true, entity: { Id: "1" } }]));
});

test("modification, conversion and unsupported sheets cannot create new records", () => {
  for (const name of ["Modify - Invoices", "Type Chg - Inv to CN", "Type Chg - CN to Inv", "Inventory Adjustment", "Budget", "General Ledger"]) assert(unsupportedSheetAction(name));
  assert.equal(unsupportedSheetAction("New - Mixed Visits"), null);
});

test("parser detects a register header below title lines and preserves money", () => {
  const csv = "10004 Checking\nDate: Custom\nDate,Payee,Payment,Deposit,Type,Account\n10/01/2026,Vendor,123.45,,Expense,Supplies\n";
  const b = Buffer.from(csv);
  const [sheet] = readWorkbook(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "register.csv");
  assert.equal(sheet.headerRow, 3);
  assert.equal(sheet.rows.length, 1);
  assert.equal(parseNumber(sheet.rows[0].data.Payment), 123.45);
  assert.equal(parseDate(sheet.rows[0].data.Date), "2026-10-01");
});

test("negative adjustment lines keep their signs and invoice total", () => {
  const rows: Vals[] = ["300", "-120", "-51.25"].map((amount) => ({ docNumber: "INV-1", date: "2026-11-01", customer: "Payer", item: "Service", amount }));
  const body = entityDef("invoices").build(rows, context()).body;
  assert.equal(body.Line.reduce((n: number, l: any) => n + l.Amount, 0), 128.75);
});
