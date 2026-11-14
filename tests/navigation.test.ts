import assert from "node:assert/strict";
import { test } from "node:test";
import { activeNavigation, NAV_GROUPS } from "../lib/navigation";

test("Bulk Upload, Modify and Bank Statements select distinct navigation targets", () => {
  assert.equal(activeNavigation("/import", ""), "/import");
  assert.equal(activeNavigation("/import/123", ""), "/import");
  assert.equal(activeNavigation("/import", "operation=update"), "/import?operation=update");
  assert.equal(activeNavigation("/import", "type=bank-statement"), "/import?type=bank-statement");
  assert.equal(activeNavigation("/import", "type=bank-statement&operation=update"), "/import?operation=update");
  assert.equal(activeNavigation("/export", ""), "/export");
});

test("unavailable navigation actions have no route and explain their limitation", () => {
  for (const group of NAV_GROUPS) for (const item of group.items) {
    if (!("href" in item)) assert("unavailable" in item && item.unavailable.length > 0);
  }
  assert.deepEqual(NAV_GROUPS.map((g) => g.label), ["Overview", "Batch Actions", "Automate", "Smart Entry", "Reports", "Tools"]);
});
