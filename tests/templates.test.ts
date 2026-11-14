import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { BANK_TEMPLATE_KEYS, sampleTemplate, TEMPLATE_HEADERS } from "../lib/import/templates";
import { catalog, entityDef } from "../lib/import/entities";
import { autoMap, detectEntity } from "../lib/import/automap";
import { readWorkbook } from "../lib/parse/file";

test("bank sample contains only the nine banking sheets and no example records", () => {
  const wb = sampleTemplate();
  assert.deepEqual(wb.SheetNames, BANK_TEMPLATE_KEYS.map((key) => TEMPLATE_HEADERS[key].sheetName));
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
    assert.equal(rows.length, 1, `${name} must contain headers only`);
  }
  assert.deepEqual(readWorkbook(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), "sample.xlsx"), []);
});

test("each bank sheet survives Excel upload with every heading mapped to the correct type", () => {
  const wb = sampleTemplate();
  for (const key of BANK_TEMPLATE_KEYS) {
    const { sheetName, headers } = TEMPLATE_HEADERS[key];
    // A populated row exercises the actual upload parser, including trailing spaces in headers.
    XLSX.utils.sheet_add_aoa(wb.Sheets[sheetName], [headers.map((h) => /date/i.test(h) ? "11/14/2026" : /amount/i.test(h) ? 25 : "Test")], { origin: "A2" });
  }
  const parsed = readWorkbook(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), "banking.xlsx");
  assert.equal(parsed.length, BANK_TEMPLATE_KEYS.length);
  for (const sheet of parsed) {
    const key = BANK_TEMPLATE_KEYS.find((k) => TEMPLATE_HEADERS[k].sheetName === sheet.name)!;
    assert.equal(sheet.headerRow, 1);
    assert.equal(sheet.rows.length, 1);
    assert.equal(detectEntity(sheet.name, sheet.headers, catalog()), key);
    const mapping = autoMap(entityDef(key).fields, sheet.headers);
    assert.deepEqual(sheet.headers.filter((h) => !Object.values(mapping).includes(h)), [], `${key}: no ignored headings`);
    for (const field of entityDef(key).fields.filter((f) => f.required === true)) {
      // SaasAnt's Bank Statement asks for the actual bank account in Mapping.
      if (key === "bank-statement" && field.key === "bankAccount") continue;
      assert(mapping[field.key], `${key}: ${field.label}`);
    }
  }
});

test("individual templates preserve source sheet names and columns; unknown types are rejected", () => {
  for (const def of catalog()) {
    const spec = TEMPLATE_HEADERS[def.key];
    assert(spec, `missing template for ${def.key}`);
    const wb = sampleTemplate(def.key);
    assert.deepEqual(wb.SheetNames, [spec.sheetName]);
    assert.deepEqual(XLSX.utils.sheet_to_json(wb.Sheets[spec.sheetName], { header: 1 }), [spec.headers]);
    assert.equal(detectEntity(spec.sheetName, spec.headers, catalog()), def.key);
  }
  for (const value of ["unknown", "../../file", "__proto__", "constructor"]) assert.throws(() => sampleTemplate(value));
});
