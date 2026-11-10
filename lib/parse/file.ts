// Reads any spreadsheet-like file (xlsx, xls, xlsm, xlsb, ods, csv, tsv, txt) into sheets of rows.
// The header row is found automatically, so bank exports with a few lines of text on top still work.
import * as XLSX from "xlsx";

export type ParsedSheet = {
  name: string;
  headers: string[];
  headerRow: number; // 1-based Excel row number of the header
  rows: { sheetRow: number; data: Record<string, unknown> }[];
};

const pad = (n: number) => String(n).padStart(2, "0");

function cellValue(c: XLSX.CellObject | undefined): unknown {
  if (!c || c.v == null) return null;
  if (c.t === "n" && c.z && XLSX.SSF.is_date(String(c.z))) {
    const d = XLSX.SSF.parse_date_code(c.v as number);
    if (d) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  if (c.t === "d" && c.v instanceof Date) return c.v.toISOString().slice(0, 10);
  if (c.t === "s") return String(c.v).replace(/ /g, " ").trim();
  if (c.t === "b") return c.v ? "TRUE" : "FALSE";
  if (c.t === "e") return null;
  return c.v;
}

function score(row: unknown[]) {
  // header rows are mostly short text, no numbers
  const cells = row.filter((v) => v != null && String(v).trim() !== "");
  const text = cells.filter((v) => typeof v === "string" && !/^[-\d.,$()]+$/.test(v) && v.length < 60);
  return text.length * 2 - (cells.length - text.length);
}

export function readWorkbook(buf: ArrayBuffer, fileName: string): ParsedSheet[] {
  const isText = /\.(csv|tsv|txt)$/i.test(fileName);
  const wb = XLSX.read(buf, { type: "array", cellNF: true, cellDates: false, raw: isText, dense: false });
  const out: ParsedSheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws["!ref"]) continue;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const lastRow = Math.min(range.e.r, 50_000);
    const grid: unknown[][] = [];
    for (let r = range.s.r; r <= lastRow; r++) {
      const row: unknown[] = [];
      for (let c = range.s.c; c <= Math.min(range.e.c, 200); c++) row.push(cellValue(ws[XLSX.utils.encode_cell({ r, c })]));
      grid.push(row);
    }
    // header = best-scoring row among the first 30
    let best = -1, bestScore = 1;
    for (let i = 0; i < Math.min(grid.length, 30); i++) {
      const s = score(grid[i]);
      if (s > bestScore) { best = i; bestScore = s; }
    }
    if (best < 0) continue;
    const seen = new Map<string, number>();
    const headers = grid[best].map((h, i) => {
      let t = String(h ?? "").replace(/\s+/g, " ").trim() || `Column ${XLSX.utils.encode_col(range.s.c + i)}`;
      const n = (seen.get(t.toLowerCase()) || 0) + 1;
      seen.set(t.toLowerCase(), n);
      if (n > 1) t = `${t} (${n})`;
      return t;
    });
    const rows: ParsedSheet["rows"] = [];
    for (let i = best + 1; i < grid.length; i++) {
      const g = grid[i];
      if (!g.some((v) => v != null && String(v).trim() !== "")) continue;
      const data: Record<string, unknown> = {};
      headers.forEach((h, j) => { if (g[j] != null && String(g[j]).trim() !== "") data[h] = g[j]; });
      rows.push({ sheetRow: range.s.r + i + 1, data });
    }
    // drop columns that are empty in every row and have a generated name
    const used = headers.filter((h) => !h.startsWith("Column ") || rows.some((r) => h in r.data));
    if (rows.length) out.push({ name, headers: used, headerRow: range.s.r + best + 1, rows });
  }
  return out;
}

/** A Google Sheets share link -> download URL for the whole workbook. */
export function googleSheetUrl(link: string) {
  const m = link.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
  return m ? `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=xlsx` : null;
}
