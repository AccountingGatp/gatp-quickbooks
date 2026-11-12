import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { ObjectId } from "mongodb";
import { DEFAULT_SETTINGS } from "../lib/types";

let job: any, rows: any[], records: any[];
const match = (r: any, q: any) => Object.entries(q).every(([k, v]) => String(r[k]) === String(v));
const R = {
  find(q: any) { const c = { sort: () => c, toArray: async () => structuredClone(rows.filter((r) => match(r, q))) }; return c; },
  async bulkWrite(ops: any[]) { for (const op of ops) { const r = rows.find((r) => String(r._id) === String(op.updateOne.filter._id)); Object.assign(r, op.updateOne.update.$set); for (const k of Object.keys(op.updateOne.update.$unset || {})) delete r[k]; } },
};
function replace(path: string, exports: any) { const key = require.resolve(path); require(key); require.cache[key]!.exports = exports; }
replace("../lib/db", { jobs: async () => ({ findOne: async () => structuredClone(job), updateOne: async (_q: any, u: any) => Object.assign(job, u.$set) }), jobRows: async () => R, companies: async () => ({}), rules: async () => ({}) });
replace("../lib/qbo/lists", { getList: async (_realm: string, kind: string) => ({ Customer: [{ id: "C", name: "Customer", active: true }], Item: [{ id: "P", name: "Service", active: true }] }[kind] || []) });
replace("../lib/qbo/client", { escapeQ: (s: string) => s, query: async () => ({ Invoice: structuredClone(records) }) });
const { validateJob } = require("../lib/import/validate") as typeof import("../lib/import/validate");

beforeEach(() => {
  job = { _id: new ObjectId(), entity: "invoices", realmId: "sandbox", status: "review", counts: {}, settings: { ...DEFAULT_SETTINGS, duplicateCheck: false, applyRules: false } };
  records = []; rows = [];
});
const add = (values: any) => rows.push({ _id: String(rows.length), jobId: String(job._id), idx: rows.length, sheetRow: rows.length + 2, status: "pending", values, issues: [], group: "" });

test("a bad line blocks its complete invoice and excludes its new names from confirmation", async () => {
  add({ docNumber: "I-1", customer: "New Customer", date: "2026-11-01", item: "Service", amount: "10" });
  add({ docNumber: "I-1", customer: "New Customer", date: "2026-11-01", item: "Missing Service", amount: "10" });
  const result = await validateJob(String(job._id));
  assert.equal(result.counts.ready, 0); assert.equal(result.counts.error, 2);
  assert.deepEqual(job.newNames, []); assert(rows.every((r) => r.status === "error"));
});

test("validation freezes the reviewed update version and blocks a newer QuickBooks edit", async () => {
  job.operation = "update";
  records = [{ Id: "45", SyncToken: "3", DocNumber: "I-1", CustomerRef: { value: "C" }, TotalAmt: 10, Balance: 10, Line: [{ DetailType: "SalesItemLineDetail", Amount: 10 }] }];
  add({ docNumber: "I-1", customer: "Customer", date: "2026-11-01", item: "Service", amount: "20" });
  assert.equal((await validateJob(String(job._id))).counts.ready, 1);
  assert.equal(rows[0].target.syncToken, "3");
  records[0].SyncToken = "4";
  assert.equal((await validateJob(String(job._id))).counts.error, 1);
  assert.equal(rows[0].target.syncToken, "3");
  assert(rows[0].issues.some((i: any) => /changed after review/.test(i.msg)));
});

test("create mode cannot accidentally replay exported QuickBooks IDs", async () => {
  add({ qboId: "45", customer: "Customer", date: "2026-11-01", item: "Service", amount: "20" });
  assert.equal((await validateJob(String(job._id))).counts.error, 1);
  assert(rows[0].issues.some((i: any) => /Choose Update existing/.test(i.msg)));
});

test("a successful recheck clears old posting errors", async () => {
  add({ customer: "Customer", date: "2026-11-01", item: "Service", amount: "20" });
  rows[0].status = "failed"; rows[0].error = "Old API refusal";
  assert.equal((await validateJob(String(job._id))).counts.ready, 1);
  assert.equal(rows[0].error, undefined);
});
