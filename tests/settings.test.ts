import assert from "node:assert/strict";
import { test } from "node:test";
import { importSettings, isZeroTransaction } from "../lib/import/settings";
import { DEFAULT_SETTINGS } from "../lib/types";
import { entityDef } from "../lib/import/entities";

test("old settings retain their behavior and unsafe string flags are ignored", () => {
  assert.deepEqual(importSettings(), DEFAULT_SETTINGS);
  const old = importSettings({ autoCreate: false, dateFormat: "DMY" });
  assert.equal(old.autoCreate, false); assert.equal(old.processEachLine, false); assert.equal(old.truncateText, true);
  const safe = importSettings({ skipZero: "false", processEachLine: "true", unknown: true } as any);
  assert.equal(safe.skipZero, false); assert.equal(safe.processEachLine, false); assert.equal((safe as any).unknown, undefined);
});

test("zero skipping preserves balanced journals and detects amounts derived from rates", () => {
  assert.equal(isZeroTransaction(entityDef("journal-entries"), [{ debit: "100" }, { credit: "100" }]), false);
  assert.equal(isZeroTransaction(entityDef("journal-entries"), [{ debit: "0" }, { credit: "0" }]), true);
  assert.equal(isZeroTransaction(entityDef("invoices"), [{ qty: "0", rate: "20" }]), true);
  assert.equal(isZeroTransaction(entityDef("invoices"), [{ amount: "invalid" }]), false);
  assert.equal(isZeroTransaction(entityDef("bank-statement"), [{ debit: "10", credit: "10" }]), false);
  assert.equal(isZeroTransaction(entityDef("items"), [{ amount: "0" }]), false);
});
