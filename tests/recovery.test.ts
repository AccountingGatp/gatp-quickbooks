// Exercise the real posting/undo functions against deterministic in-memory adapters.
// The adapters simulate lost API responses and failed database writes; no network is used.
import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { ObjectId } from "mongodb";
import { DEFAULT_SETTINGS } from "../lib/types";

const clone = <T>(v: T): T => {
  if (v instanceof ObjectId) return new ObjectId(v.toHexString()) as T;
  if (v instanceof Date) return new Date(v) as T;
  if (Array.isArray(v)) return v.map(clone) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) as T;
  return v;
};
const at = (o: any, path: string) => path.split(".").reduce((v, k) => v?.[k], o);
const eq = (a: any, b: any) => a instanceof ObjectId || b instanceof ObjectId ? String(a) === String(b) : a === b;
function matches(doc: any, q: any): boolean {
  return Object.entries(q).every(([k, v]: [string, any]) => {
    if (k === "$or") return v.some((p: any) => matches(doc, p));
    const x = at(doc, k);
    if (v && typeof v === "object" && !(v instanceof ObjectId)) return Object.entries(v).every(([op, val]: [string, any]) => {
      if (op === "$in") return val.some((a: any) => eq(a, x));
      if (op === "$exists") return (x !== undefined) === val;
      if (op === "$lt") return x < val;
      if (op === "$ne") return !eq(x, val);
      throw new Error("Unsupported test query " + op);
    });
    return eq(x, v);
  });
}
function assign(doc: any, path: string, value: any, remove = false) {
  const keys = path.split("."), last = keys.pop()!;
  for (const k of keys) doc = doc[k] ||= {};
  if (remove) delete doc[last]; else doc[last] = clone(value);
}
class MemoryCollection {
  docs: any[] = [];
  failPostedWrite = 0;
  failInsert = false;
  async insertOne(doc: any) { if (this.failInsert) throw new Error("Injected backup write failure"); this.docs.push(clone(doc)); return { insertedId: doc._id }; }
  async insertMany(docs: any[]) { for (const doc of docs) await this.insertOne(doc); }
  find(q: any) {
    let rows = this.docs.filter((d) => matches(d, q));
    const cursor = { sort: (s: any) => { const [key, dir] = Object.entries(s)[0] as [string, number]; rows.sort((a, b) => (at(a, key) > at(b, key) ? 1 : -1) * dir); return cursor; }, toArray: async () => clone(rows) };
    return cursor;
  }
  async findOne(q: any) { return clone(this.docs.find((d) => matches(d, q)) || null); }
  async countDocuments(q: any) { return this.docs.filter((d) => matches(d, q)).length; }
  async updateMany(q: any, u: any) {
    if (u.$set?.status === "posted" && this.failPostedWrite && --this.failPostedWrite === 0) throw new Error("Injected row persistence failure");
    const rows = this.docs.filter((d) => matches(d, q));
    for (const d of rows) {
      for (const [k, v] of Object.entries(u.$set || {})) assign(d, k, v);
      for (const k of Object.keys(u.$unset || {})) assign(d, k, null, true);
      for (const [k, v] of Object.entries(u.$inc || {})) assign(d, k, (at(d, k) || 0) + Number(v));
    }
    return { matchedCount: rows.length };
  }
  async updateOne(q: any, u: any) { const hit = this.docs.find((d) => matches(d, q)); return hit ? this.updateMany({ _id: hit._id }, u) : { matchedCount: 0 }; }
  async findOneAndUpdate(q: any, u: any, options?: any) { const before = await this.findOne(q); if (!before) return null; await this.updateOne(q, u); return options?.returnDocument === "after" ? this.findOne({ _id: before._id }) : before; }
  async bulkWrite(ops: any[]) { for (const op of ops) { const x = op.updateMany || op.updateOne; await this.updateMany(x.filter, x.update); } }
}
const J = new MemoryCollection(), R = new MemoryCollection(), B = new MemoryCollection(), C = new MemoryCollection();
const dbPath = require.resolve("../lib/db");
require(dbPath);
require.cache[dbPath]!.exports = { jobs: async () => J, jobRows: async () => R, postBatches: async () => B, companies: async () => C };

let loseResponse = false, deleteStale = false, verifyBackups = false;
const requests = new Map<string, { payload: string; results: any[] }>();
let created = 0, apiCalls = 0, queryCalls = 0;
const clientPath = require.resolve("../lib/qbo/client");
require(clientPath);
require.cache[clientPath]!.exports = {
  escapeQ: (s: string) => s,
  query: async () => { queryCalls++; return {}; },
  batch: async (_realm: string, ops: any[], rid?: string) => {
    apiCalls++;
    if (ops.some((o) => o.operation === "delete")) {
      if (verifyBackups) for (const op of ops) assert(R.docs.some((r) => r.raw?.Id === op.body.Id && r.status === "pending"), "full backup must exist before QuickBooks delete");
      return ops.map((o) => ({ bId: o.bId, ok: !deleteStale, entity: { Id: o.body.Id }, ...(deleteStale ? { error: "Stale Object Error: edited by another user" } : {}) }));
    }
    assert(rid, "create requests must have a durable request ID");
    const payload = JSON.stringify(ops);
    if (requests.has(rid)) { assert.equal(requests.get(rid)!.payload, payload, "replay must use an identical payload"); return clone(requests.get(rid)!.results); }
    const results = ops.map((o) => ({ bId: o.bId, ok: true, entity: { Id: String(++created), SyncToken: "0", TotalAmt: o.body.Amount ?? 10 } }));
    requests.set(rid, { payload, results: clone(results) });
    if (loseResponse) { loseResponse = false; throw new Error("Injected lost QuickBooks response"); }
    return results;
  },
};
function replace(path: string, exports: any) { const key = require.resolve(path); require(key); require.cache[key]!.exports = exports; }
replace("../lib/qbo/lists", { addToList: async () => {}, clearLists: async () => {} });
replace("../lib/audit", { logActivity: async () => {} });
replace("../lib/import/resolver", { norm: (s: string) => s.toLowerCase(), Resolver: class {
  async load() {} canCreate() { return null; } add() {}
  find(kind: string, value: string) { return value ? { value, name: value, kind } : null; }
} });
async function recount(jobId: string) {
  const rows = await R.find({ jobId }).toArray();
  const c: any = { total: rows.length, ready: 0, error: 0, warning: 0, skipped: 0, posted: 0, failed: 0, rolledBack: 0, transactions: rows.length };
  for (const r of rows) c[r.status === "rolled_back" ? "rolledBack" : r.status]++;
  return c;
}
replace("../lib/import/validate", { fillGroup: (_d: any, rows: any[]) => rows, jobSettings: async () => DEFAULT_SETTINGS, paysBills: () => false, refKinds: () => [], recount, validateJob: async () => {} });
const { postChunk, rollbackChunk } = require("../lib/import/post") as typeof import("../lib/import/post");
replace("../lib/http", { route: (fn: any) => fn, requireCompany: async () => ({ session: { name: "Tester" }, company: { _id: "company", name: "Sample" } }) });
const { POST: deleteRecords } = require("../app/api/delete/route") as { POST: (req: Request) => Promise<any> };

let id: ObjectId;
beforeEach(async () => {
  for (const col of [J, R, B, C]) { col.docs = []; col.failPostedWrite = 0; col.failInsert = false; }
  requests.clear(); created = apiCalls = queryCalls = 0; loseResponse = deleteStale = verifyBackups = false;
  id = new ObjectId();
  await J.insertOne({ _id: id, kind: "import", entity: "transfers", entityLabel: "Transfers", realmId: "company", companyName: "Sample", status: "review", createdAt: new Date(), counts: {} });
  await C.insertOne({ _id: "company" });
});
async function rows(n: number) {
  for (let idx = 0; idx < n; idx++) await R.insertOne({ _id: new ObjectId(), jobId: String(id), idx, group: `r:${idx}`, status: "ready", values: { from: "Bank", to: "Savings", amount: String(idx + 1), date: "2026-11-01" }, issues: [] });
}

test("lost API response resumes the saved request without creating duplicates", async () => {
  await rows(2); loseResponse = true;
  await assert.rejects(postChunk(String(id), "Tester"), /lost QuickBooks response/);
  assert.equal(created, 2); assert.equal(B.docs.length, 1);
  assert(!B.docs[0].completed);
  const result = await postChunk(String(id), "Tester");
  assert.equal(result.counts.posted, 2); assert.equal(created, 2); assert.equal(apiCalls, 2);
  assert(B.docs[0].completed);
});

test("partly persisted results recover before a new batch is built", async () => {
  await rows(31); R.failPostedWrite = 2;
  await assert.rejects(postChunk(String(id), "Tester"), /persistence failure/);
  assert.equal(created, 30); assert.equal(R.docs.filter((r) => r.status === "posted").length, 1);
  assert(B.docs[0].results);
  const result = await postChunk(String(id), "Tester");
  assert.equal(result.counts.posted, 31); assert.equal(created, 31);
  assert.equal(apiCalls, 2, "stored results should be replayed locally without a second API call");
});

test("old uncertain imports are blocked instead of being reconstructed", async () => {
  await rows(1); R.docs[0].status = "posting"; J.docs[0].status = "posting";
  await assert.rejects(postChunk(String(id), "Tester"), /older import/);
  assert.equal(apiCalls, 0);
});

test("undo preserves transactions changed after posting", async () => {
  await rows(1); await postChunk(String(id), "Tester"); deleteStale = true;
  const result = await rollbackChunk(String(id), "Tester");
  assert.equal(result.status, "partial"); assert.equal(R.docs[0].status, "posted");
  assert.match(R.docs[0].error, /Stale/); assert.equal(queryCalls, 0, "undo must not fetch a newer token and force-delete");
});

test("company lock prevents simultaneous imports from posting", async () => {
  await rows(1); C.docs[0].postingLockUntil = Date.now() + 100_000; C.docs[0].postingLockToken = "other";
  await assert.rejects(postChunk(String(id), "Tester"), /Another import/);
  assert.equal(apiCalls, 0); assert.equal(J.docs[0].lockToken, undefined);
  assert.equal(C.docs[0].postingLockToken, "other");
});

const deleteRequest = () => new Request("https://example.test/api/delete", { method: "POST", body: JSON.stringify({ type: "Transfer", records: [{ Id: "123", SyncToken: "0", Amount: 25, TxnDate: "2026-11-01" }], last: true }) });

test("delete persists complete backups before sending any API request", async () => {
  verifyBackups = true;
  const result = await deleteRecords(deleteRequest());
  assert.equal(result.results[0].ok, true);
  assert.equal(R.docs[0].raw.Amount, 25);
  assert.equal(R.docs[0].status, "posted");
});

test("failed backup persistence prevents deletion", async () => {
  R.failInsert = true;
  await assert.rejects(deleteRecords(deleteRequest()), /backup write failure/);
  assert.equal(apiCalls, 0);
});

test("bulk delete does not fetch a new SyncToken after a stale-record error", async () => {
  deleteStale = true;
  const result = await deleteRecords(deleteRequest());
  assert.equal(result.results[0].ok, false);
  assert.match(result.results[0].error, /changed after/);
  assert.equal(queryCalls, 0);
  assert.equal(R.docs[0].status, "failed");
});
