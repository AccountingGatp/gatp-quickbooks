"use client";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button, Empty, PageHeader, Panel, Progress, cx, useToast } from "@/components/ui";
import { SearchForm, refsList, type SearchValues } from "@/components/SearchForm";
import { api, money, plural, usDate } from "@/lib/client";
import { QB_TYPE } from "@/lib/qbtypes";

export default function ExportPage() {
  const toast = useToast();
  const [co, setCo] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ v: SearchValues; rows: any[]; items: any[]; loaded: number; more: boolean } | null>(null);
  const [fmt, setFmt] = useState<"xlsx" | "csv">("xlsx");
  useEffect(() => { api("/api/companies").then((r) => setCo(r.companies.find((c: any) => c.realmId === r.active)?.name || "")); }, []);

  async function run(v: SearchValues) {
    setBusy(true); setRes({ v, rows: [], items: [], loaded: 0, more: true });
    try {
      let start: number | null = 1;
      const rows: any[] = [], items: any[] = [];
      while (start) {
        const r: any = await api("/api/export/search", { json: { type: v.type, dateField: v.dateField, from: v.from, to: v.to, refs: refsList(v.refs), start } });
        rows.push(...r.rows); items.push(...r.items);
        setRes({ v, rows: [...rows], items: [...items], loaded: items.length, more: !!r.next });
        start = r.next;
        if (items.length >= 100_000) break;
      }
    } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  }

  function download() {
    if (!res) return;
    const label = QB_TYPE.get(res.v.type)?.label || res.v.type;
    const name = `${co} - ${label} - ${res.v.from} to ${res.v.to}`.replace(/[\\/:*?"<>|]/g, "-");
    const ws = XLSX.utils.json_to_sheet(res.rows);
    if (fmt === "csv") {
      const blob = new Blob([XLSX.utils.sheet_to_csv(ws)], { type: "text/csv" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name + ".csv"; a.click();
    } else {
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31)); XLSX.writeFile(wb, name + ".xlsx");
    }
    api("/api/activity", { json: { action: "Exported", detail: `${label}, ${res.items.length} records, ${res.v.from} to ${res.v.to}`, companyName: co } }).catch(() => {});
  }

  return (
    <>
      <PageHeader icon={<Download />} tone="teal" title="Export" sub={<>Download transactions or lists from <b className="font-semibold text-ink">{co || "the active company"}</b> to Excel or CSV. Transactions get one row per line.</>} />
      <Panel className="mb-5"><SearchForm busy={busy} onSearch={run} submitLabel="Find records" /></Panel>
      {res && (
        <Panel pad={false} title={busy ? `Reading from QuickBooks… ${res.loaded.toLocaleString()} so far` : `${plural(res.items.length, "record")} found${res.rows.length !== res.items.length ? `, ${plural(res.rows.length, "row")} with lines` : ""}`}
          actions={!busy && res.items.length > 0 && <>
            <div className="flex rounded-[var(--radius-sm)] border border-rule p-0.5 text-[12.5px]">
              {(["xlsx", "csv"] as const).map((f) => <button key={f} onClick={() => setFmt(f)} className={cx("rounded-[4px] px-2 py-0.5 font-medium", fmt === f ? "bg-ink text-white" : "text-ink-2")}>{f === "xlsx" ? "Excel" : "CSV"}</button>)}
            </div>
            <Button variant="primary" size="sm" icon={<Download className="size-3.5" />} onClick={download}>Download</Button>
          </>}>
          {busy && <div className="px-4 pt-3"><Progress value={60} live /></div>}
          {!busy && !res.items.length ? <Empty icon={<FileSpreadsheet className="size-8" />} title="Nothing found">Try a wider date range, or search by the date the records were added.</Empty> : (
            <div className="max-h-[60vh] overflow-auto">
              <table className="ledger-grid w-full">
                <thead><tr><th className="!p-0" /><th>Date</th><th>Type</th><th>No.</th><th>Name</th><th className="text-right">Total</th><th>Memo</th></tr></thead>
                <tbody>
                  {res.items.slice(0, 300).map((it) => (
                    <tr key={it.id}><td className="rail bg-rule" /><td className="num">{usDate(it.date)}</td><td>{it.kind}</td><td>{it.number}</td><td className="max-w-[260px] truncate">{it.name}</td><td className="num text-right">{money(it.total)}</td><td className="max-w-[320px] truncate text-ink-3">{it.memo}</td></tr>
                  ))}
                </tbody>
              </table>
              {res.items.length > 300 && <p className="px-4 py-2.5 text-[12.5px] text-ink-3">Showing the first 300. The download has all {res.items.length.toLocaleString()}.</p>}
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
