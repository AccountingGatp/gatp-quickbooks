"use client";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { Check, RefreshCw, Columns3, Download, Undo2, Trash2, Send, AlertTriangle, CheckCircle2, ArrowLeft, EyeOff } from "lucide-react";
import { Badge, Button, JobStatus, Modal, Progress, Spinner, cx, useToast } from "@/components/ui";
import { Mapping, type MappingState } from "@/components/import/Mapping";
import { Review } from "@/components/import/Review";
import { RefLists, type Lists } from "@/components/import/RefLists";
import { api, plural, when } from "@/lib/client";
import { catalog } from "@/lib/import/entities";
import { autoMap } from "@/lib/import/automap";
import { DEFAULT_SETTINGS, type Counts } from "@/lib/types";

const CAT = catalog();
type Job = any;

export default function ImportJob({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [lists, setLists] = useState<Lists>({});
  const [samples, setSamples] = useState<Record<string, unknown>[]>([]);
  const [initial, setInitial] = useState<MappingState | null>(null);
  const [saved, setSaved] = useState<{ updatedBy: string; updatedAt: string } | null>(null);
  const [remap, setRemap] = useState(false);
  const [busy, setBusy] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [confirm, setConfirm] = useState<"" | "post" | "undo" | "discard">("");
  const [run, setRun] = useState<{ kind: "post" | "undo"; start: number; target: number; counts: Counts } | null>(null);

  const reload = useCallback(async () => {
    const r = await api(`/api/jobs/${id}`);
    setJob(r.job);
    return r.job;
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const j = await reload();
        const def = CAT.find((e) => e.key === j.entity)!;
        const kinds = new Set<string>(["Account"]);
        for (const e of CAT) for (const f of e.fields) if (f.type === "ref" && f.ref) (f.ref === "Name" ? ["Vendor", "Customer", "Employee"] : [f.ref]).forEach((k) => kinds.add(k));
        api(`/api/lists?kinds=${[...kinds].join(",")}`).then(setLists).catch((e) => toast("error", "Could not read QuickBooks names: " + e.message));
        const s = await api(`/api/jobs/${id}/rows?limit=8&raw=1`);
        setSamples(s.rows.map((r: any) => r.raw || {}));
        let st: MappingState;
        if (j.mapping) st = { entity: j.entity, mapping: j.mapping, fixed: j.fixed || {}, flipSign: !!j.flipSign, settings: { ...DEFAULT_SETTINGS, ...(j.settings || {}) } };
        else {
          const m = await api(`/api/mappings`, { json: { headers: j.headers, entity: j.entity } });
          if (m.mapping) { setSaved(m.mapping); st = { entity: j.entity, mapping: { ...autoMap(def.fields, j.headers), ...m.mapping.mapping }, fixed: m.mapping.fixed || {}, flipSign: m.mapping.flipSign, settings: { ...DEFAULT_SETTINGS, ...(j.settings || {}) } }; }
          else st = { entity: j.entity, mapping: autoMap(def.fields, j.headers), fixed: {}, flipSign: !!j.flipSign, settings: { ...DEFAULT_SETTINGS, ...(j.settings || {}) } };
        }
        setInitial(st);
      } catch (e) { toast("error", (e as Error).message); }
    })();
  }, [id, reload, toast]);

  // QuickBooks register reports name the bank account in their title line: use it when nothing is set yet
  useEffect(() => {
    if (!job || job.status !== "mapping" || !initial || !lists.Account?.length) return;
    const field = job.entity === "bank-statement" ? "bankAccount" : job.entity === "card-statement" ? "ccAccount" : "";
    if (!field || initial.fixed[field] || initial.mapping[field]) return;
    const title = String(job.notes?.[0] || "").split("\t")[0].trim();
    const m = title.match(/^(\d[\d.-]*)\s+(.+)$/);
    const low = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();
    const want = field === "bankAccount" ? "Bank" : "Credit Card";
    const accts = lists.Account.filter((a) => a.type === want);
    const hit = title && accts.find((a) => (m && a.number === m[1] && low(a.name.split(":").pop()!) === low(m[2])) || low(a.name) === low(m ? m[2] : title))
      || (m && accts.filter((a) => a.number === m[1]).length === 1 ? accts.find((a) => a.number === m[1]) : undefined);
    if (hit) setInitial({ ...initial, fixed: { ...initial.fixed, [field]: hit.name } });
  }, [job, initial, lists]);

  const def = useMemo(() => (job ? CAT.find((e) => e.key === job.entity) : null), [job]);
  // grid columns: anything mapped, filled or needed; a value typed once for every row is shown above the grid instead
  const fixedOnly = useMemo(() => def && job ? def.fields.filter((f) => job.fixed?.[f.key] && !job.mapping?.[f.key]) : [], [def, job]);
  const visible = useMemo(() => def && job ? def.fields.filter((f) => !fixedOnly.includes(f) && (job.mapping?.[f.key] || f.required === true || job.fieldsUsed?.includes(f.key)
    || (["bank-statement", "card-statement"].includes(def.key) && ["payee", "category"].includes(f.key)))).map((f) => f.key) : [], [def, job, fixedOnly]);

  async function applyMapping(m: MappingState) {
    setBusy("map");
    try {
      const r = await api(`/api/jobs/${id}/mapping`, { method: "PUT", json: m });
      await reload(); setRemap(false); setRefresh((x) => x + 1);
      toast(r.counts.error ? "info" : "ok", r.counts.error ? `${plural(r.counts.error, "row")} need fixing before they can be posted.` : (r.counts.ready === 1 ? "The row is ready." : `All ${plural(r.counts.ready, "row")} are ready.`));
    } catch (e) { toast("error", (e as Error).message); } finally { setBusy(""); }
  }
  async function recheck(fresh: boolean) {
    setBusy("check");
    try {
      await api(`/api/jobs/${id}/validate`, { json: { fresh } });
      await reload(); setRefresh((x) => x + 1);
      toast("ok", fresh ? "QuickBooks names re-read and rows checked again." : "Rows checked again.");
      if (fresh) api(`/api/lists?fresh=1`).then(setLists).catch(() => {});
    } catch (e) { toast("error", (e as Error).message); } finally { setBusy(""); }
  }
  async function skipDups() {
    setBusy("dups");
    try { const r = await api(`/api/jobs/${id}/rows`, { method: "PATCH", json: { skipDuplicates: true } }); setJob({ ...job, counts: r.counts }); setRefresh((x) => x + 1); toast("ok", "Possible duplicates left out."); }
    catch (e) { toast("error", (e as Error).message); } finally { setBusy(""); }
  }

  async function loop(kind: "post" | "undo") {
    setConfirm("");
    const c0: Counts = job.counts;
    setRun({ kind, start: kind === "post" ? c0.posted + c0.failed : c0.rolledBack, target: kind === "post" ? c0.ready : c0.posted, counts: c0 });
    try {
      for (let i = 0; i < 500; i++) {
        const r = await api(`/api/jobs/${id}/${kind === "post" ? "post" : "rollback"}`, { json: {} });
        setRun((x) => x && { ...x, counts: r.counts });
        if (r.message) toast("error", r.message);
        if (r.done) break;
      }
      const j = await reload();
      setRefresh((x) => x + 1);
      if (kind === "post") toast(j.counts.failed ? "info" : "ok", j.counts.failed ? `${plural(j.counts.posted, "row")} posted. ${plural(j.counts.failed, "row")} were refused by QuickBooks; see “Needs fixing”.` : `${plural(j.counts.posted, "row")} posted to ${j.companyName}.`);
      else toast("ok", `Import undone. ${plural(j.counts.rolledBack, "row")} removed from QuickBooks.`);
    } catch (e) { toast("error", (e as Error).message + "\nYou can safely try again: rows already done are not repeated."); await reload(); }
    finally { setRun(null); }
  }

  async function discard() {
    setConfirm("");
    try { await api(`/api/jobs/${id}`, { method: "DELETE" }); toast("ok", "Import discarded."); router.push("/import"); }
    catch (e) { toast("error", (e as Error).message); }
  }

  async function downloadResults() {
    setBusy("dl");
    try {
      const all: any[] = [];
      for (let off = 0; ; off += 5000) {
        const r = await api(`/api/jobs/${id}/rows?limit=5000&offset=${off}`);
        all.push(...r.rows);
        if (all.length >= r.total || !r.rows.length) break;
      }
      const label: Record<string, string> = { posted: "Posted", failed: "Refused by QuickBooks", error: "Needs fixing", ready: "Ready (not posted)", skipped: "Left out", rolled_back: "Undone", pending: "Not checked" };
      const data = all.map((r) => ({
        Row: r.sheetRow, Result: label[r.status] || r.status, "QuickBooks type": r.qbo?.type || "", "QuickBooks ID": r.qbo?.id || "",
        Problems: [r.error, ...(r.issues || []).map((i: any) => i.msg)].filter(Boolean).join("; "),
        ...Object.fromEntries(def!.fields.filter((f) => visible.includes(f.key)).map((f) => [f.label, r.values[f.key] ?? ""])),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Results");
      XLSX.writeFile(wb, `${job.companyName} - ${job.entityLabel} - results.xlsx`.replace(/[\\/:*?"<>|]/g, "-"));
    } catch (e) { toast("error", (e as Error).message); } finally { setBusy(""); }
  }

  if (!job || !def) return <div className="py-24 text-center"><Spinner className="size-6" /></div>;
  const c: Counts = job.counts;
  const st = job.status as string;
  const step = st === "mapping" || remap ? 2 : st === "review" ? 3 : 4;
  const finished = ["completed", "partial", "failed", "rolled_back"].includes(st);
  const interrupted = st === "posting" && !job.busy && !run;
  const editable = !run && (st === "review" || st === "partial" || st === "failed");
  const newNames: { kind: string; name: string }[] = job.newNames || [];

  return (
    <>
      <RefLists lists={lists} />
      {/* header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/import" className="mb-1 inline-flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5" />Import</Link>
          <h1 className="flex flex-wrap items-center gap-2.5 text-[22px] font-semibold leading-tight">{job.entityLabel} <JobStatus status={st} /></h1>
          <p className="mt-1 text-[13.5px] text-ink-3">
            Into <b className="font-semibold text-ink">{job.companyName}</b>. From {job.fileName}{job.sheetName ? `, sheet “${job.sheetName}”` : ""}. Started by {job.user}, {when(job.createdAt)}.
          </p>
        </div>
        <Stepper step={step} done={finished} />
      </div>

      {/* step 2: columns */}
      {(st === "mapping" || remap) && initial && (
        <Mapping cat={CAT} headers={job.headers} samples={samples} initial={remap && job.mapping ? { entity: job.entity, mapping: job.mapping, fixed: job.fixed || {}, flipSign: !!job.flipSign, settings: { ...DEFAULT_SETTINGS, ...job.settings } } : initial}
          saved={st === "mapping" ? saved : null} lists={lists} busy={busy === "map"} onSubmit={applyMapping} onCancel={remap ? () => setRemap(false) : undefined} />
      )}
      {(st === "mapping" && !initial) && <div className="py-20 text-center"><Spinner /></div>}

      {/* step 3/4: review & results */}
      {!(st === "mapping" || remap) && (
        <>
          {finished && <ResultBanner job={job} />}
          {interrupted && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-amber-line bg-amber-soft px-4 py-3 text-[13.5px]">
              <AlertTriangle className="size-4 text-amber" />
              <span className="flex-1">Posting stopped part-way (the page was closed or the connection dropped). {plural(c.posted, "row")} are already in QuickBooks; nothing will be posted twice.</span>
              <Button variant="primary" onClick={() => loop("post")} icon={<Send className="size-4" />}>Continue posting</Button>
            </div>
          )}

          {fixedOnly.length > 0 && (
            <p className="mb-2 text-[13px] text-ink-3">Same for every row: {fixedOnly.map((f, i) => <span key={f.key}>{i > 0 && ", "}{f.label} <b className="font-semibold text-ink">{job.fixed[f.key]}</b></span>)}{editable && c.posted === 0 && <> (<button className="text-green underline-offset-2 hover:underline" onClick={() => setRemap(true)}>change</button>)</>}</p>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Summary c={c} />
            <div className="ml-auto flex flex-wrap gap-2">
              {editable && c.posted === 0 && <Button size="sm" icon={<Columns3 className="size-3.5" />} onClick={() => setRemap(true)}>Change columns</Button>}
              {editable && <Button size="sm" icon={<RefreshCw className="size-3.5" />} loading={busy === "check"} onClick={() => recheck(true)} title="Re-read accounts, names and items from QuickBooks, then check every row again">Check again</Button>}
              {editable && <Button size="sm" icon={<EyeOff className="size-3.5" />} loading={busy === "dups"} onClick={skipDups}>Leave out duplicates</Button>}
              {(finished || c.posted > 0) && <Button size="sm" icon={<Download className="size-3.5" />} loading={busy === "dl"} onClick={downloadResults}>Download results</Button>}
              {c.posted > 0 && !run && <Button size="sm" variant="ghost" className="text-red hover:bg-red-soft" icon={<Undo2 className="size-3.5" />} onClick={() => setConfirm("undo")}>Undo import</Button>}
              {c.posted === 0 && !run && st !== "rolled_back" && <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirm("discard")}>Discard</Button>}
            </div>
          </div>

          <Review jobId={id} def={def} counts={run?.counts || c} visible={visible} editable={editable} refreshKey={refresh}
            onChanged={(counts) => setJob((j: Job) => ({ ...j, counts }))} />

          {/* post bar */}
          {editable && (
            <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-rule bg-paper/95 px-4 py-3 backdrop-blur lg:-mx-7 lg:px-7">
              <div className="flex flex-wrap items-center gap-4">
                <div className="text-[13.5px]">
                  {c.ready > 0 ? <>
                    <b className="num font-semibold">{plural(c.ready, "row")}</b> ready to post
                    {c.error > 0 && <span className="text-ink-3">. {plural(c.error, "row")} with problems will be left out until fixed</span>}
                    {c.error === 0 && c.skipped > 0 && <span className="text-ink-3">. {plural(c.skipped, "row")} left out</span>}
                    .
                  </> : <span className="text-ink-3">{c.error ? "Fix the rows marked in red to post them." : "Nothing left to post."}</span>}
                </div>
                <Button variant="primary" size="lg" className="ml-auto" disabled={c.ready === 0} onClick={() => setConfirm("post")} icon={<Send className="size-4" />}>
                  {c.posted > 0 ? `Post ${plural(c.ready, "more row")}` : `Post ${plural(c.ready, "row")} to QuickBooks`}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* running */}
      <Modal open={!!run} onClose={() => {}} title={run?.kind === "undo" ? "Undoing import" : `Posting to ${job.companyName}`}>
        {run && (() => {
          const now = run.kind === "post" ? run.counts.posted + run.counts.failed - run.start : run.counts.rolledBack - run.start;
          const pct = (now / Math.max(1, run.target)) * 100;
          return (
            <div>
              <Progress value={pct} live />
              <div className="num mt-3 flex justify-between text-[13px]">
                <span>{now.toLocaleString()} of {run.target.toLocaleString()} rows</span>
                {run.kind === "post" && run.counts.failed > 0 && <span className="text-red">{plural(run.counts.failed, "refused")}</span>}
              </div>
              <p className="mt-3 text-[12.5px] text-ink-3">Keep this page open. If it closes, open the import from History and continue; rows already done are never repeated.</p>
            </div>
          );
        })()}
      </Modal>

      {/* confirms */}
      <Modal open={confirm === "post"} onClose={() => setConfirm("")} title="Post to QuickBooks?"
        footer={<><Button onClick={() => setConfirm("")}>Cancel</Button><Button variant="primary" icon={<Send className="size-4" />} onClick={() => loop("post")}>Post {plural(c.ready, "row")}</Button></>}>
        <div className="mb-3 rounded-[var(--radius-md)] border border-green-line bg-green-soft px-3 py-2.5">
          <div className="text-[12px] text-green">Company</div>
          <div className="text-[16px] font-semibold text-ink">{job.companyName}</div>
        </div>
        <ul className="space-y-1.5">
          <li><b className="num">{plural(c.ready, "row")}</b> will be posted{def.isList ? ` as new ${def.label.toLowerCase()}` : ""}.</li>
          {c.error > 0 && <li className="text-amber">{c.error === 1 ? "1 row with problems is" : `${c.error.toLocaleString()} rows with problems are`} left out.</li>}
          {c.skipped > 0 && <li className="text-ink-3">{c.skipped === 1 ? "1 row is" : `${c.skipped.toLocaleString()} rows are`} left out on purpose (including possible duplicates).</li>}
          {c.warning > 0 && <li className="text-amber">{c.warning === 1 ? "1 row has a warning" : `${c.warning.toLocaleString()} rows have warnings`}; see the Warnings tab.</li>}
          {newNames.length > 0 && <li>New names to create: <span className="text-ink-3">{newNames.slice(0, 8).map((n) => n.name).join(", ")}{newNames.length > 8 ? ` and ${newNames.length - 8} more` : ""}</span></li>}
        </ul>
        <p className="mt-3 text-[12.5px] text-ink-3">You can undo the whole import afterwards from this page or from History.</p>
      </Modal>
      <Modal open={confirm === "undo"} onClose={() => setConfirm("")} title="Undo this import?"
        footer={<><Button onClick={() => setConfirm("")}>Keep it</Button><Button variant="danger" icon={<Undo2 className="size-4" />} onClick={() => loop("undo")}>Undo import</Button></>}>
        <p>Deletes the {plural(c.posted, "posted row")} of this import from <b className="text-ink">{job.companyName}</b>. Records that QuickBooks never deletes (customers, vendors, items, accounts) are made inactive instead{(job.created?.length || 0) > 0 ? `, including ${plural(job.created.length, "name")} this import created` : ""}.</p>
        <p className="mt-2 text-[12.5px] text-ink-3">Transactions edited in QuickBooks since posting are still removed.</p>
      </Modal>
      <Modal open={confirm === "discard"} onClose={() => setConfirm("")} title="Discard this import?"
        footer={<><Button onClick={() => setConfirm("")}>Cancel</Button><Button variant="danger" onClick={discard}>Discard</Button></>}>
        Nothing from it is in QuickBooks. The uploaded rows are removed from GATP Ledger.
      </Modal>
    </>
  );
}

function Stepper({ step, done }: { step: number; done: boolean }) {
  const steps = ["Upload", "Match columns", "Review", "Post"];
  return (
    <ol className="flex items-center gap-1.5 text-[12.5px]">
      {steps.map((s, i) => {
        const n = i + 1, complete = n < step || (done && n === 4), current = n === step && !done;
        return (
          <li key={s} className="flex items-center gap-1.5">
            {i > 0 && <span className={cx("h-px w-5", complete || current ? "bg-green-line" : "bg-rule")} />}
            <span className={cx("num grid size-5 place-items-center rounded-full border text-[11px] font-semibold", complete ? "border-green bg-green text-white" : current ? "border-green text-green" : "border-rule text-ink-4")}>
              {complete ? <Check className="size-3" strokeWidth={3} /> : n}
            </span>
            <span className={cx(current ? "font-semibold text-ink" : complete ? "text-ink-2" : "text-ink-4")}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Summary({ c }: { c: Counts }) {
  const item = (n: number, label: string, cls: string) => n > 0 && <span className="flex items-center gap-1.5"><span className={cx("size-2 rounded-full", cls)} /><b className="num font-semibold">{n.toLocaleString()}</b> <span className="text-ink-3">{label}</span></span>;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
      {item(c.posted, "posted", "bg-green")}
      {item(c.ready, "ready", "bg-green-line")}
      {item(c.warning, "with warnings", "bg-amber")}
      {item(c.error + c.failed, "need fixing", "bg-red")}
      {item(c.skipped, "left out", "bg-ink-4")}
      {item(c.rolledBack, "undone", "bg-ink-4")}
      <span className="border-l border-rule pl-4 text-ink-3">{plural(c.transactions, "transaction")}</span>
    </div>
  );
}

function ResultBanner({ job }: { job: Job }) {
  const c: Counts = job.counts;
  const st = job.status;
  if (st === "rolled_back") return <Banner tone="gray" icon={<Undo2 className="size-5" />} title="This import was undone" text={`${plural(c.rolledBack, "row")} were removed from ${job.companyName}.`} />;
  if (st === "completed") return <Banner tone="green" icon={<CheckCircle2 className="size-5" />} title={`${plural(c.posted, "row")} posted to ${job.companyName}`} text={`Finished ${when(job.finishedAt)}. Open any posted row in QuickBooks from the Check column.`} />;
  return <Banner tone={st === "failed" ? "red" : "amber"} icon={<AlertTriangle className="size-5" />} title={st === "failed" ? "Nothing was posted" : `${plural(c.posted, "row")} posted, ${plural(c.failed + c.error, "row")} not posted`} text="Fix the rows under “Needs fixing” (click a cell to edit), then post again. Rows already posted are not repeated." />;
}
function Banner({ tone, icon, title, text }: { tone: "green" | "amber" | "red" | "gray"; icon: React.ReactNode; title: string; text: string }) {
  const t = { green: "border-green-line bg-green-soft text-green", amber: "border-amber-line bg-amber-soft text-amber", red: "border-red-line bg-red-soft text-red", gray: "border-rule bg-paper text-ink-2" }[tone];
  return (
    <div className={cx("mb-4 flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3", t)}>
      {icon}<div><div className="text-[14.5px] font-semibold text-ink">{title}</div><div className="text-[13px] text-ink-2">{text}</div></div>
    </div>
  );
}
