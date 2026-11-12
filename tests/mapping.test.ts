import assert from "node:assert/strict";
import { test } from "node:test";
import { catalog } from "../lib/import/entities";
import { assignColumn, mappingForType, repeatedSource } from "../lib/import/mapping";

const type = (key: string) => catalog().find((e) => e.key === key)!;

test("the same file headers map to fields of the chosen transaction type", () => {
  const headers = ["Date", "Customer", "Vendor", "Amount", "Product/Service", "Payment", "Deposit"];
  const invoice = mappingForType(type("invoices"), headers);
  const bill = mappingForType(type("bills"), headers);
  const bank = mappingForType(type("bank-statement"), headers);
  assert.equal(invoice.customer, "Customer"); assert.equal(invoice.vendor, undefined);
  assert.equal(bill.vendor, "Vendor"); assert.equal(bill.customer, undefined);
  assert.equal(bank.debit, "Payment"); assert.equal(bank.credit, "Deposit"); assert.equal(bank.amount, "Amount");
  for (const [key, mapping] of [["invoices", invoice], ["bills", bill], ["bank-statement", bank]] as const) assert.deepEqual(Object.keys(mapping), type(key).fields.map((f) => f.key));
});

test("saved mappings cannot leak another type's fields, obsolete headers or duplicate sources", () => {
  const def = type("invoices"), headers = ["Date", "Customer", "Amount"];
  const result = mappingForType(def, headers, { vendor: "Customer", customer: "Customer", date: "Date", memo: "Customer", description: "Gone", amount: null });
  assert.equal(result.vendor, undefined); assert.equal(result.description, null);
  assert.equal(result.amount, null, "an explicit ignore stays ignored");
  assert.equal(repeatedSource(result), null);
  assert(Object.values(result).every((h) => h === null || headers.includes(h)));
});

test("assigning a file column moves its target without duplicate or foreign mappings", () => {
  const def = type("invoices"), initial = mappingForType(def, ["Invoice Date", "Date", "Customer"]);
  const moved = assignColumn(def, initial, "Date", "date");
  assert.equal(moved.date, "Date"); assert.equal(Object.values(moved).includes("Invoice Date"), false);
  assert.equal(repeatedSource(moved), null);
  const ignored = assignColumn(def, moved, "Date", "");
  assert.equal(ignored.date, null); assert.equal(ignored.customer, "Customer");
  const foreign = assignColumn(def, ignored, "Customer", "vendor");
  assert.equal(foreign.vendor, undefined); assert.equal(foreign.customer, null);
  assert.equal(repeatedSource({ date: "Date", memo: "Date" }), "Date");
});

test("saved layout matches reuse this file's spelling and preserve both register sides", () => {
  const result = mappingForType(type("bank-statement"), ["DATE", "PAYMENT", "DEPOSIT"], { date: "Date", amount: "Deposit", debit: null, credit: null });
  assert.equal(result.date, "DATE"); assert.equal(result.amount, null);
  assert.equal(result.debit, "PAYMENT"); assert.equal(result.credit, "DEPOSIT");
});
