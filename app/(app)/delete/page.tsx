"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { Trash2, ShieldCheck, Download } from "lucide-react";
import { Button, Empty, Modal, PageHeader, Panel, Progress, Spinner, cx, useToast } from "@/components/ui";
import { SearchForm, refsList, type SearchValues } from "@/components/SearchForm";
import { api, money, plural, usDate } from "@/lib/client";
import { QB_TYPE } from "@/lib/qbtypes";

export default function DeletePage() {
  const toast = useToast();
  const [co, setCo] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ v: SearchValues; items: any[]; recs: any[] } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  const [run, setRun] = useState<{ done: number; total: number; failed: { id: string; error: string }[]; jobId?: string; finished?: boolean } | null>(null);
  useEffect(() => { api("/api/companies").then((r) => setCo(r.companies.find((c: any) => c.realmId === r.active)?.name || "")); }, []);

  async function search(v: SearchValues) {
    setBusy(true); setFound(null); setRun(null);
    try {
      let start: number | null = 1;
      const items: any[] = [], recs: any[] = [];
      while (start && items.length < 10_000) {
        const r: any = await api("/api/export/search", { json: { type: v.type, dateField: v.dateField, from: v.from, to: v.to, refs: refsList(v.refs), start, mode: "delete" } });
        items.push(...r.items); recs.push(...r.backup); start = r.next;
      }
      setFound({ v, items, recs }); setSel(new Set(items.map((i) => i.id)));
    } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  }

  const chosen = useMemo(() => (found ? found.recs.filter((r) => sel.has(String(r.Id))) : []), [found, sel]);
  const total = useMemo(() => found ? found.items.filter((i) => sel.has(i.id)).reduce((s, i) => s + i.total, 0) : 0, [found, sel]);
  const label = found ? QB_TYPE.get(found.v.type)?.label || "" : "";

  function backup() {
    if (!found) return;
    const name = `BACKUP ${co} - ${label} - ${new Date().toISOString().slice(0, 10)}`.replace(/[\\/:*?"<>|]/g, "-");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(found.items.filter((i) => sel.has(i.id)).map((i) => ({ Id: i.id, Type: i.kind, Date: i.date, Number: i.number, Name: i.name, Account: i.account, Total: i.total, Memo: i.memo }))), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["QuickBooks record (JSON)"], ...chosen.map((r) => [JSON.stringify(r)])]), "Full records");
    XLSX.writeFile(wb, name + ".xlsx");
  }

  async function del() {
    setConfirm(false); setTyped("");
    backup();
    const recs = chosen;
    setRun({ done: 0, total: recs.length, failed: [] });
    let jobId: string | undefined;
    const failed: { id: string; error: string }[] = [];
    try {
      for (let i = 0; i < recs.length; i += 60) {
        const part = recs.slice(i, i + 60);
        const r: any = await api("/api/delete", { json: { jobId, type: found!.v.type, records: part, total: recs.length, last: i + 60 >= recs.length, filter: { from: found!.v.from, to: found!.v.to, dateField: found!.v.dateField } } });
        jobId = r.jobId;
        failed.push(...r.results.filter((x: any) => !x.ok));
        setRun({ done: Math.min(i + 60, recs.length), total: recs.length, failed: [...failed], jobId });
      }
      setRun({ done: recs.length, total: recs.length, failed, jobId, finished: true });
      toast(failed.length ? "info" : "ok", failed.length ? `${plural(recs.length - failed.length, "record")} deleted, ${failed.length} could not be deleted.` : `${plural(recs.length, "record")} deleted from ${co}.`);
      const gone = new Set(recs.map((r) => String(r.Id)).filter((id) => !failed.some((f) => f.id === id)));
      setFound((f) => f && { ...f, items: f.items.filter((x) => !gone.has(x.id)), recs: f.recs.filter((x) => !gone.has(String(x.Id))) });
      setSel(new Set());
    } catch (e) { toast("error", (e as Error).message); setRun((r) => r && { ...r, finished: true }); }
  }

  return (
    <>
      <PageHeader title="Delete" sub={<>Find and remove many transactions at once from <b className="font-semibold text-ink">{co || "the active company"}</b>. A backup file downloads automatically before anything is deleted, and a copy is kept in History.</>} />
      <Panel className="mb-5"><SearchForm deletable busy={busy} onSearch={search} submitLabel="Find transactions" /></Panel>

      {run && (
        <Panel className="mb-5">
          <div className="flex items-center justify-between text-[13.5px]"><b className="font-semibold">{run.finished ? "Finished" : "Deleting…"}</b><span className="num text-ink-3">{run.done} of {run.total}</span></div>
          <div className="mt-2"><Progress value={(run.done / Math.max(1, run.total)) * 100} live={!run.finished} tone="red" /></div>
          {run.failed.length > 0 && <ul className="mt-3 space-y-1 text-[12.5px] text-red">{run.failed.slice(0, 8).map((f) => <li key={f.id}>#{f.id}: {f.error}</li>)}</ul>}
          {run.finished && run.jobId && <p className="mt-3 text-[12.5px] text-ink-3">Recorded in <Link className="text-green underline" href="/history">History</Link>, with the full records kept as a backup.</p>}
        </Panel>
      )}

      {busy && <div className="py-10 text-center"><Spinner /></div>}
      {found && (
        <Panel pad={false} title={`${plural(found.items.length, "transaction")} found`} actions={found.items.length > 0 && <>
          <Button size="sm" icon={<Download className="size-3.5" />} onClick={backup} disabled={!sel.size}>Backup only</Button>
          <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} disabled={!sel.size || !!(run && !run.finished)} onClick={() => setConfirm(true)}>Delete {sel.size.toLocaleString()}</Button>
        </>}>
          {!found.items.length ? <Empty title="Nothing found">No transactions match. Check the date range and type.</Empty> : (
            <div className="max-h-[60vh] overflow-auto">
              <table className="ledger-grid w-full">
                <thead><tr>
                  <th className="w-8 !px-2"><input type="checkbox" aria-label="Select all" checked={sel.size === found.items.length} onChange={() => setSel(sel.size === found.items.length ? new Set() : new Set(found.items.map((i) => i.id)))} /></th>
                  <th>Date</th><th>Type</th><th>No.</th><th>Name</th><th>Account</th><th className="text-right">Total</th><th>Memo</th>
                </tr></thead>
                <tbody>
                  {found.items.map((it) => (
                    <tr key={it.id} className={cx(sel.has(it.id) && "is-selected")}>
                      <td className="!px-2"><input type="checkbox" aria-label={`Select ${it.number || it.id}`} checked={sel.has(it.id)} onChange={() => { const s = new Set(sel); s.has(it.id) ? s.delete(it.id) : s.add(it.id); setSel(s); }} /></td>
                      <td className="num">{usDate(it.date)}</td><td>{it.kind}</td><td>{it.number}</td><td className="max-w-[240px] truncate">{it.name}</td><td className="max-w-[180px] truncate text-ink-3">{it.account}</td><td className="num text-right">{money(it.total)}</td><td className="max-w-[280px] truncate text-ink-3">{it.memo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} title={`Delete ${plural(sel.size, "transaction")}?`}
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" disabled={typed.trim().toUpperCase() !== "DELETE"} icon={<Trash2 className="size-4" />} onClick={del}>Delete from QuickBooks</Button></>}>
        <div className="mb-3 rounded-[var(--radius-md)] border border-red-line bg-red-soft px-3 py-2.5">
          <div className="text-[12px] text-red">Company</div>
          <div className="text-[16px] font-semibold text-ink">{co}</div>
          <div className="num mt-1 text-[13px] text-ink-2">{plural(sel.size, label.toLowerCase().replace(/s$/, ""), label.toLowerCase())}, totalling {money(total)}</div>
        </div>
        <p className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-green" />A backup Excel file downloads first. QuickBooks cannot restore deleted transactions, so keep it.</p>
        <label className="mt-4 block text-[12.5px] font-medium text-ink-2">Type DELETE to confirm</label>
        <input className="field mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
      </Modal>
    </>
  );
}
