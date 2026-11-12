"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { FileSpreadsheet, UploadCloud, Link2, Download, Sparkles, ArrowRight, Building2, Upload } from "lucide-react";
import { Badge, Button, Empty, IconChip, JobStatus, PageHeader, Panel, Progress, Spinner, cx, useToast } from "@/components/ui";
import { ENTITY_ICON, GROUP_TONE } from "@/components/entityIcons";
import { api, plural, when } from "@/lib/client";
import { catalog, type CatalogEntity } from "@/lib/import/entities";
import { detectEntity } from "@/lib/import/automap";
import { readWorkbook, type ParsedSheet } from "@/lib/parse/file";
import { modificationSheet, UPDATE_TYPES } from "@/lib/import/updates";
import { unsupportedSheetAction } from "@/lib/import/grouping";

const CAT = catalog();
const GROUPS = ["Banking", "Purchases", "Sales", "Accounting", "Lists"] as const;
const ACCEPT = ".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.tsv,.txt";

type Sheet = ParsedSheet & { detected: string | null; choice: string };

export default function ImportStart() {
  const router = useRouter();
  const toast = useToast();
  const [company, setCompany] = useState<{ name: string } | null | undefined>(undefined);
  const [operation, setOperation] = useState<"create" | "update">("create");
  const [type, setType] = useState<string>("auto");
  const [file, setFile] = useState<{ name: string; sheets: Sheet[] } | null>(null);
  const [reading, setReading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [gsheet, setGsheet] = useState("");
  const [upload, setUpload] = useState<{ sheet: string; done: number; total: number } | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = new URLSearchParams(location.search).get("type");
    if (t && CAT.some((e) => e.key === t)) setType(t);
    api("/api/companies").then((r) => setCompany(r.companies.find((c: any) => c.realmId === r.active) || null));
    api("/api/jobs?kind=import&limit=8").then((r) => setRecent(r.jobs.filter((j: any) => ["mapping", "review", "posting", "partial", "failed"].includes(j.status)))).catch(() => {});
  }, []);

  const chosen = CAT.find((e) => e.key === type);
  // changing the type after the file is read applies it to every sheet
  useEffect(() => {
    setFile((f) => f && { ...f, sheets: f.sheets.map((s) => ({ ...s, choice: type !== "auto" ? type : s.detected || "" })) });
  }, [type]);

  async function readFile(name: string, buf: ArrayBuffer) {
    setReading(true);
    try {
      if (/\.pdf$/i.test(name)) throw new Error("PDF statements are not supported yet. Export the statement from online banking as CSV or Excel (most banks offer “Download transactions”).");
      const sheets = readWorkbook(buf, name);
      if (!sheets.length) throw new Error("No rows found in this file. Check that the first sheet has a header row and data under it.");
      setFile({
        name, sheets: sheets.map((s) => {
          const detected = detectEntity(s.name, s.headers, CAT);
          return { ...s, detected, choice: type !== "auto" ? type : detected || "" };
        }),
      });
    } catch (e) { toast("error", (e as Error).message); } finally { setReading(false); }
  }
  async function onFile(f?: File) {
    if (!f) return;
    if (f.size > 40 * 1024 * 1024) return toast("error", "This file is larger than 40 MB. Split it into smaller files.");
    await readFile(f.name, await f.arrayBuffer());
  }
  async function fromGoogle() {
    setReading(true);
    try {
      const r = await fetch("/api/fetch-sheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: gsheet }) });
      if (!r.ok) throw new Error((await r.json()).error);
      await readFile("Google Sheet.xlsx", await r.arrayBuffer());
    } catch (e) { toast("error", (e as Error).message); setReading(false); }
  }

  const sheetOperation = (s: Sheet) => modificationSheet(s.name) ? "update" : operation;
  const blockedFor = (s: Sheet) => unsupportedSheetAction(s.name, s.choice, sheetOperation(s)) || (sheetOperation(s) === "update" && !UPDATE_TYPES[s.choice] ? "Update existing supports Invoices and Credit memos only." : null);

  async function start(s: Sheet) {
    const blocked = blockedFor(s);
    if (blocked) return toast("error", blocked);
    if (!s.choice) return toast("error", "Choose what this sheet contains first.");
    setUpload({ sheet: s.name, done: 0, total: s.rows.length });
    try {
      const { id } = await api("/api/jobs", { json: { entity: s.choice, fileName: file!.name, sheetName: s.name, headers: s.headers, notes: s.notes, operation: sheetOperation(s) } });
      const CH = 800;
      for (let i = 0; i < s.rows.length; i += CH) {
        await api(`/api/jobs/${id}/rows`, { json: { start: i, rows: s.rows.slice(i, i + CH) } });
        setUpload({ sheet: s.name, done: Math.min(i + CH, s.rows.length), total: s.rows.length });
      }
      router.push(`/import/${id}`);
    } catch (e) { toast("error", (e as Error).message); setUpload(null); }
  }

  function template(e: CatalogEntity) {
    const ws = XLSX.utils.aoa_to_sheet([e.fields.map((f) => f.label)]);
    ws["!cols"] = e.fields.map((f) => ({ wch: Math.max(12, f.label.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, e.label.slice(0, 31));
    XLSX.writeFile(wb, `GATP Ledger template - ${e.label}.xlsx`);
  }

  if (company === undefined) return <div className="py-20 text-center"><Spinner /></div>;
  if (company === null) return (
    <>
      <PageHeader title="Import" />
      <Panel><Empty icon={<Building2 className="size-8" />} title="Choose a client company first" action={<Link href="/companies"><Button variant="primary">Open companies</Button></Link>}>Imports always go into the company shown at the top of the page. Pick one there, or connect a new one.</Empty></Panel>
    </>
  );

  return (
    <>
      <PageHeader icon={<Upload />} title="Import" sub={<>Upload a spreadsheet, check every line, then post it to <b className="font-semibold text-ink">{company.name}</b>.</>} />

      <Panel title="Import action">
        <label className="flex items-center gap-3 text-[13.5px]">Action
          <select className="field max-w-[300px]" value={operation} onChange={(e) => setOperation(e.target.value as "create" | "update")}>
            <option value="create">Create new records</option><option value="update">Update existing invoices / credit memos</option>
          </select>
        </label>
        <p className="mt-2 text-[12.5px] text-ink-3">Update matches a QuickBooks ID or a unique document number and customer. Include every product/service line. Paid, applied, taxed or complex records are held back. Sheets named Modify, Update or Edit always use update mode.</p>
      </Panel>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* file */}
          {!file ? (
            <Panel title="Your file">
              <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
                className={cx("flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-md)] border-2 border-dashed px-6 py-12 text-center transition-colors", drag ? "border-green bg-green-soft" : "border-green-line/70 bg-[#f8fbf9] hover:border-green hover:bg-green-soft/50")}>
                <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => onFile(e.target.files?.[0])} />
                {reading ? <><Spinner className="size-6" /><p className="mt-3 text-[14px] font-medium">Reading the file…</p></> : <>
                  <span className="grid size-14 place-items-center rounded-full bg-gradient-to-br from-mint to-green text-white shadow-[0_10px_24px_-10px_rgba(13,122,91,.7)]"><UploadCloud className="size-7" strokeWidth={1.8} /></span>
                  <p className="mt-3 text-[15px] font-semibold">Drop a file here, or <span className="text-green underline underline-offset-2">choose a file</span></p>
                  <p className="mt-1 text-[12.5px] text-ink-3">Excel (.xlsx, .xls, .xlsm, .xlsb), CSV, TSV, text or OpenDocument. Header row can be anywhere in the first 30 rows.</p>
                </>}
              </label>
              <div className="mt-4 flex items-center gap-2">
                <Link2 className="size-4 shrink-0 text-ink-3" />
                <input className="field" placeholder="…or paste a Google Sheets link (shared as Anyone with the link)" value={gsheet} onChange={(e) => setGsheet(e.target.value)} />
                <Button disabled={!gsheet.trim() || reading} onClick={fromGoogle}>Open</Button>
              </div>
            </Panel>
          ) : (
            <Panel title={<span className="flex items-center gap-2"><FileSpreadsheet className="size-4 text-green" />{file.name}</span>} actions={<Button size="sm" variant="ghost" onClick={() => { setFile(null); if (input.current) input.current.value = ""; }}>Choose another file</Button>} pad={false}>
              <table className="w-full text-[13.5px]">
                <thead><tr className="border-b border-rule-2 text-left text-[12px] text-ink-3"><th className="px-4 py-2 font-medium">Sheet</th><th className="px-4 py-2 font-medium">Rows</th><th className="px-4 py-2 font-medium">Contains</th><th /></tr></thead>
                <tbody>
                  {file.sheets.map((s, i) => (
                    <tr key={s.name} className="border-b border-rule-2 last:border-0">
                      <td className="px-4 py-2.5"><div className="font-medium">{s.name}</div><div className="max-w-[340px] truncate text-[12px] text-ink-3" title={s.headers.join(", ")}>{s.headers.slice(0, 6).join(", ")}{s.headers.length > 6 ? "…" : ""}</div>{blockedFor(s) && <p className="mt-1 max-w-[340px] text-[12px] text-red" role="status">{blockedFor(s)}</p>}</td>
                      <td className="num px-4 py-2.5 text-ink-2">{s.rows.length.toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <select className="field max-w-[230px]" value={s.choice} onChange={(e) => setFile({ ...file, sheets: file.sheets.map((x, j) => (j === i ? { ...x, choice: e.target.value } : x)) })}>
                          <option value="">Choose…</option>
                          {GROUPS.map((g) => <optgroup key={g} label={g}>{CAT.filter((e) => e.group === g).map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}</optgroup>)}
                        </select>
                        {s.detected && s.detected === s.choice && type === "auto" && <div className="mt-1 text-[11.5px] text-green">Recognised automatically{sheetOperation(s) === "update" ? " · Update existing" : ""}</div>}
                        {!s.detected && type === "auto" && <div className="mt-1 text-[11.5px] text-amber">Not recognised. Pick a type, or skip this sheet.</div>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {upload?.sheet === s.name
                          ? <div className="w-[160px]"><Progress value={(upload.done / Math.max(1, upload.total)) * 100} live /><div className="mt-1 text-[11.5px] text-ink-3">Uploading {upload.done.toLocaleString()} of {upload.total.toLocaleString()}</div></div>
                          : <Button variant="primary" size="sm" disabled={!s.choice || !!upload || !!blockedFor(s)} onClick={() => start(s)}>Import this sheet <ArrowRight className="size-3.5" /></Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
          {/* what */}
          <Panel title={file ? "What the file contains" : "What are you importing?"} actions={chosen && <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => template(chosen)}>Blank template</Button>}>
            <button onClick={() => setType("auto")} className={cx("mb-5 flex w-full items-center gap-3 rounded-[var(--radius-md)] border px-3.5 py-3 text-left transition-colors", type === "auto" ? "border-green bg-green-soft ring-1 ring-green" : "border-rule hover:border-green-line")}>
              <IconChip tone="green"><Sparkles /></IconChip>
              <span><span className="block text-[13.5px] font-semibold">Work it out from the file</span><span className="block text-[12.5px] text-ink-3">Reads the sheet names and column titles. SaasAnt template files are recognised sheet by sheet.</span></span>
            </button>
            <div className="space-y-5">
              {GROUPS.map((g) => (
                <div key={g}>
                  <div className="mb-2 text-[12.5px] font-semibold text-ink-2">{g}</div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {CAT.filter((e) => e.group === g).map((e) => {
                      const I = ENTITY_ICON[e.key] || FileSpreadsheet;
                      const on = type === e.key;
                      return (
                        <button key={e.key} onClick={() => setType(e.key)} title={e.description}
                          className={cx("flex items-center gap-2.5 rounded-[10px] border px-2.5 py-2 text-left transition-colors", on ? "border-green bg-green-soft ring-1 ring-green" : "border-rule-2 bg-paper hover:border-green-line hover:bg-ledger")}>
                          <IconChip tone={GROUP_TONE[g]} size="sm"><I strokeWidth={1.9} /></IconChip>
                          <span className={cx("text-[13px] leading-tight", on ? "font-semibold text-green" : "font-medium text-ink")}>{e.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {chosen && <p className="mt-4 border-t border-rule-2 pt-3 text-[13px] text-ink-3"><b className="font-semibold text-ink-2">{chosen.label}:</b> {chosen.description}</p>}
          </Panel>

        </div>

        <aside className="space-y-5">
          <Panel title="How it works">
            <ol className="space-y-3 text-[13px] text-ink-2">
              {[
                ["Upload", "Any spreadsheet. Nothing reaches QuickBooks yet."],
                ["Match columns", "Done for you when the column titles are known; saved for next time."],
                ["Review", "Every row is checked against the company’s accounts, names and existing transactions. Fix cells right in the grid."],
                ["Post", "Ready rows go to QuickBooks. You can undo the whole import afterwards."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="num mt-px grid size-5 shrink-0 place-items-center rounded-full border border-green-line bg-green-soft text-[11px] font-semibold text-green">{i + 1}</span>
                  <span><b className="font-semibold text-ink">{t}.</b> {d}</span>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Unfinished imports" pad={false}>
            {recent.length ? (
              <ul>
                {recent.map((j) => (
                  <li key={j._id} className="border-b border-rule-2 last:border-0">
                    <Link href={`/import/${j._id}`} className="block px-4 py-2.5 hover:bg-ledger">
                      <div className="flex items-center justify-between gap-2"><span className="truncate text-[13.5px] font-medium">{j.entityLabel}</span><JobStatus status={j.status} /></div>
                      <div className="truncate text-[12px] text-ink-3">{j.companyName}, {plural(j.counts.total, "row")}, {when(j.updatedAt)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="px-4 py-4 text-[13px] text-ink-3">Nothing waiting. Imports you start but do not post stay here.</p>}
          </Panel>
        </aside>
      </div>
    </>
  );
}

