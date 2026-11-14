"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileSpreadsheet, UploadCloud, Link2, Download, Sparkles, ArrowRight, Building2, Upload } from "lucide-react";
import { Badge, Button, Empty, IconChip, JobStatus, PageHeader, Panel, Progress, Spinner, cx, useToast } from "@/components/ui";
import { ImportSteps } from "@/components/import/ImportSteps";
import { api, plural, when } from "@/lib/client";
import { catalog } from "@/lib/import/entities";
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
  const query = useSearchParams().toString();
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
    api("/api/companies").then((r) => setCompany(r.companies.find((c: any) => c.realmId === r.active) || null));
    api("/api/jobs?kind=import&limit=8").then((r) => setRecent(r.jobs.filter((j: any) => ["mapping", "review", "posting", "partial", "failed"].includes(j.status)))).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(query);
    const nextOperation = params.get("operation") === "update" ? "update" : "create";
    setOperation(nextOperation);
    const requested = params.get("type");
    setType(requested && CAT.some((e) => e.key === requested && (nextOperation === "create" || UPDATE_TYPES[e.key])) ? requested : "auto");
    setFile(null);
  }, [query]);

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
      if (!sheets.length) throw new Error("No transaction rows found. If this is a blank template, fill in the required sheets below their headings, save it, and upload it again.");
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
      router.push(`/import/${id}${sheetOperation(s) === "update" ? "?operation=update" : s.choice === "bank-statement" ? "?type=bank-statement" : ""}`);
    } catch (e) { toast("error", (e as Error).message); setUpload(null); }
  }


  if (company === undefined) return <div className="py-20 text-center"><Spinner /></div>;
  if (company === null) return (
    <>
      <PageHeader title="Upload files" />
      <Panel><Empty icon={<Building2 className="size-8" />} title="Choose a client company first" action={<Link href="/companies"><Button variant="primary">Open companies</Button></Link>}>Imports always go into the company shown at the top of the page. Pick one there, or connect a new one.</Empty></Panel>
    </>
  );

  const available = operation === "update" ? CAT.filter((e) => UPDATE_TYPES[e.key]) : CAT;
  return (
    <>
      <PageHeader title={operation === "update" ? "Modify transactions" : "Upload files"} sub={<>Select the files you want to upload to <b className="font-semibold text-ink">{company.name}</b>.</>} />
      <div className="mb-6 flex flex-wrap items-end gap-4 border-b border-rule pb-5">
        <label className="block w-full max-w-[350px] text-[13px] font-semibold" htmlFor="transaction-type">Select Transaction Type
          <select id="transaction-type" className="field mt-2 font-normal" value={type} onChange={(e) => router.replace(`/import?type=${encodeURIComponent(e.target.value)}${operation === "update" ? "&operation=update" : ""}`)}>
            <option value="auto">Auto-detect from file</option>
            {GROUPS.map((g) => <optgroup key={g} label={g}>{available.filter((e) => e.group === g).map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}</optgroup>)}
          </select>
        </label>
        <label className="block w-full max-w-[240px] text-[13px] font-semibold" htmlFor="import-operation">Operation
          <select id="import-operation" className="field mt-2 font-normal" value={operation} onChange={(e) => router.replace(e.target.value === "update" ? "/import?operation=update" : "/import")}>
            <option value="create">Import</option><option value="update">Modify</option>
          </select>
        </label>
      </div>
      {operation === "update" && <p className="mb-5 rounded-md border border-amber-line bg-amber-soft p-3 text-[13px]">Modify supports Invoices and Credit Memos only. Include all product/service lines. Paid, applied, taxed and complex records are blocked.</p>}
      <div className="import-workspace">
        <ImportSteps step={1} />
        <div className="min-w-0">
          {recent.length > 0 && <section aria-label="Unprocessed files" className="mb-7 rounded-md border border-green-line bg-green-soft px-6 py-5">
            <p className="mb-4 text-[13px]">There are unprocessed files from your previous uploads. Please select the required file.</p>
            <div className="flex flex-wrap gap-3">{recent.map((j) => <Link key={j._id} href={`/import/${j._id}`} className="max-w-full rounded-md bg-forest px-3 py-2 text-[12.5px] text-white hover:bg-green" title={`${j.companyName} · ${j.entityLabel}`}><span className="block truncate">{j.fileName || j.entityLabel}</span><span className="mt-1 block text-[10px] text-white/70">{j.entityLabel} · {j.counts.total} rows</span></Link>)}</div>
          </section>}
          <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_260px]">
            <section aria-label="Upload files" className="min-w-0">
              {!file ? <>
                <label htmlFor="transaction-file" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (!reading && !upload) onFile(e.dataTransfer.files[0]); }} className={cx("relative flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-[10px] border border-dashed px-5 py-12 text-center", drag ? "border-green bg-green-soft" : "border-green-line bg-paper hover:bg-green-soft/30")}>
                  <input id="transaction-file" ref={input} type="file" accept={ACCEPT} disabled={reading || !!upload} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Browse your files" onChange={(e) => onFile(e.target.files?.[0])} />
                  {reading ? <><Spinner className="size-6" /><p role="status" className="mt-4">Reading your file…</p></> : <><span className="grid size-14 place-items-center rounded-full bg-green-soft text-green"><UploadCloud className="size-7" strokeWidth={1.6} /></span><p className="mt-5 text-[13px]">Drag 'n' drop your file here, or <span className="font-semibold text-green">Browse your files</span></p><p className="mt-3 text-[12px] text-ink-3">Excel, CSV, TSV, TXT or OpenDocument · Maximum 40 MB</p></>}
                </label>
                <div className="mt-5 flex flex-wrap items-center gap-2"><label htmlFor="google-sheet" className="sr-only">Google Sheets link</label><Link2 className="size-4 shrink-0 text-ink-3" /><input id="google-sheet" className="field min-w-0 flex-1" placeholder="Or paste a Google Sheets link" value={gsheet} onChange={(e) => setGsheet(e.target.value)} /><Button disabled={!gsheet.trim() || reading} onClick={fromGoogle}>Open</Button></div>
              </> : <Panel title={<span className="flex min-w-0 items-center gap-2"><FileSpreadsheet className="size-4 shrink-0 text-green" /><span className="truncate">{file.name}</span></span>} actions={<Button size="sm" variant="ghost" disabled={!!upload} onClick={() => setFile(null)}>Choose another file</Button>} pad={false}>
                <div className="overflow-x-auto"><table className="w-full text-[13px]"><thead><tr className="border-b border-rule text-left text-[12px] text-ink-3"><th className="px-4 py-3">Sheet</th><th className="px-4 py-3">Rows</th><th className="px-4 py-3">Transaction Type</th><th className="px-4 py-3"><span className="sr-only">Action</span></th></tr></thead><tbody>{file.sheets.map((s, i) => <tr key={s.name} className="border-b border-rule-2 last:border-0">
                  <td className="px-4 py-3"><b className="font-semibold">{s.name}</b>{blockedFor(s) && <p className="mt-1 max-w-[260px] text-[12px] text-red" role="status">{blockedFor(s)}</p>}</td><td className="px-4 py-3 num">{s.rows.length.toLocaleString()}</td>
                  <td className="px-4 py-3"><select aria-label={`Transaction type for ${s.name}`} disabled={!!upload} className="field min-w-[160px]" value={s.choice} onChange={(e) => setFile({ ...file, sheets: file.sheets.map((x, j) => j === i ? { ...x, choice: e.target.value } : x) })}><option value="">Select…</option>{GROUPS.map((g) => <optgroup key={g} label={g}>{available.filter((e) => e.group === g).map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}</optgroup>)}</select>{s.detected === s.choice && <p className="mt-1 text-[11px] text-green">Recognised automatically</p>}</td>
                  <td className="px-4 py-3">{upload?.sheet === s.name ? <div className="min-w-[100px]" role="status"><Progress value={upload.done / Math.max(1, upload.total) * 100} live /><span className="text-[11px]">Uploading {upload.done} of {upload.total}</span></div> : <Button size="sm" variant="primary" disabled={!s.choice || !!upload || !!blockedFor(s)} onClick={() => start(s)}>Next <ArrowRight className="size-3.5" /></Button>}</td>
                </tr>)}</tbody></table></div>
              </Panel>}
              {chosen && <p className="mt-4 text-[12px] text-ink-3"><b>{chosen.label}:</b> {chosen.description}</p>}
            </section>
            <aside className="min-w-0 space-y-6 text-[13px]">
              <section aria-labelledby="template-heading"><h2 id="template-heading" className="font-semibold">Use our templates</h2><p className="mt-1 text-[12px] text-ink-3">Download our sample templates to map your data. Keep the sheet names and column headings.</p>
                <a href="/api/templates" className="mt-4 flex items-start gap-2 text-green hover:underline"><Download className="mt-0.5 size-4 shrink-0" />Download Sample Template for Bank Transactions</a>
                {chosen && <a href={`/api/templates?type=${encodeURIComponent(chosen.key)}`} className="mt-4 flex items-start gap-2 text-green hover:underline"><FileSpreadsheet className="mt-0.5 size-4 shrink-0" />Download Sample Template for {chosen.label}</a>}
                <p className="mt-4 text-[12px] text-ink-3">Templates are blank. Add your own transactions; no example records will be imported.</p>
              </section>
              <section className="rounded-md border border-rule bg-paper p-4"><h2 className="font-semibold">Before you upload</h2><p className="mt-2 text-[12px] text-ink-3">Bank Statement: positive amounts are money in; negative amounts are money out. Account is the category; select the bank account in Map Fields.</p><p className="mt-3 text-[12px] text-ink-3">CreditCardStatement: positive amounts are charges; negative amounts are credits or payments. Confirm the amount signs.</p><p className="mt-3 text-[12px] text-ink-3">Bill payments require existing bills. Deposits from Undeposited Funds need existing payment links. Always review mappings, duplicates and totals before posting.</p></section>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}
