import * as XLSX from "xlsx";
import headers from "./template-headers.json";

// Only sheet names and header cells from the supplied SaasAnt simple template.
// Never distribute its example transactions, customer lists or employee data.
export const TEMPLATE_HEADERS: Record<string, { sheetName: string; headers: string[] }> = headers;
export const BANK_TEMPLATE_KEYS = ["bank-statement", "card-statement", "expenses", "checks", "card-credits", "deposits", "transfers", "card-payments", "bill-payments"];

export function sampleTemplate(type = "banking") {
  const keys = type === "banking" ? BANK_TEMPLATE_KEYS : [type];
  if (keys.some((key) => !Object.hasOwn(TEMPLATE_HEADERS, key))) throw new Error("Unknown template type.");
  const workbook = XLSX.utils.book_new();
  for (const key of keys) {
    const { sheetName, headers } = TEMPLATE_HEADERS[key];
    const sheet = XLSX.utils.aoa_to_sheet([headers]);
    sheet["!cols"] = headers.map((h) => ({ wch: Math.max(16, Math.min(38, h.trim().length + 3)) }));
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  }
  return workbook;
}
