"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { History as HistoryIcon } from "lucide-react";
import { Badge, Button, Empty, JobStatus, PageHeader, Panel, Spinner, Tabs, cx } from "@/components/ui";
import { api, plural, when } from "@/lib/client";

export default function HistoryPage() {
  const [tab, setTab] = useState<"jobs" | "activity">("jobs");
  const [scope, setScope] = useState<"company" | "all">("company");
  const [kind, setKind] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [data, setData] = useState<{ list: any[]; total: number } | null>(null);
  const [skip, setSkip] = useState(0);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("tab") === "activity") setTab("activity");
    api("/api/companies").then((r) => { setActive(r.active); if (!r.active) setScope("all"); });
  }, []);
  useEffect(() => {
    if (active === null && scope === "company") return;
    setData(null);
    const realm = scope === "company" && active ? `&realmId=${active}` : "";
    if (tab === "jobs") api(`/api/jobs?limit=50&skip=${skip}${realm}${kind ? `&kind=${kind}` : ""}`).then((r) => setData({ list: r.jobs, total: r.total }));
    else api(`/api/activity?limit=100&skip=${skip}${realm}`).then((r) => setData({ list: r.activity, total: r.total }));
  }, [tab, scope, kind, active, skip]);
  useEffect(() => setSkip(0), [tab, scope, kind]);
  const page = tab === "jobs" ? 50 : 100;

  return (
    <>
      <PageHeader title="History" sub="Every import and bulk delete, who ran it and what happened. Open an import to see each row, download results or undo it." actions={
        <div className="flex rounded-[var(--radius-sm)] border border-rule bg-paper p-0.5 text-[12.5px]">
          {(["company", "all"] as const).map((s) => <button key={s} disabled={s === "company" && !active} onClick={() => setScope(s)} className={cx("rounded-[4px] px-2.5 py-1 font-medium disabled:opacity-40", scope === s ? "bg-ink text-white" : "text-ink-2 hover:bg-ledger")}>{s === "company" ? "This company" : "All companies"}</button>)}
        </div>} />
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 pt-1">
          <Tabs value={tab} onChange={setTab} items={[{ value: "jobs", label: "Imports and deletes" }, { value: "activity", label: "Activity log" }]} />
          {tab === "jobs" && (
            <select className="field mb-1.5 h-8 w-[170px] py-0" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Imports and deletes</option><option value="import">Imports only</option><option value="delete">Deletes only</option>
            </select>
          )}
        </div>
        <div className="border-t border-rule">
          {!data ? <div className="py-16 text-center"><Spinner /></div> : !data.list.length ? <Empty icon={<HistoryIcon className="size-8" />} title="Nothing here yet">{tab === "jobs" ? "Imports and bulk deletes appear here as soon as they start." : "Logins, uploads, posts, undos, exports and deletes are recorded here."}</Empty> : tab === "jobs" ? (
            <table className="ledger-grid w-full">
              <thead><tr><th className="!p-0" /><th>When</th>{scope === "all" && <th>Company</th>}<th>What</th><th>By</th><th className="text-right">Rows</th><th>Result</th><th /></tr></thead>
              <tbody>
                {data.list.map((j) => (
                  <tr key={j._id}>
                    <td className={cx("rail", j.status === "completed" ? "bg-green" : ["partial"].includes(j.status) ? "bg-amber" : j.status === "failed" ? "bg-red" : "bg-rule")} />
                    <td className="whitespace-nowrap text-ink-2" title={new Date(j.createdAt).toLocaleString()}>{when(j.createdAt)}</td>
                    {scope === "all" && <td className="max-w-[220px] truncate">{j.companyName}</td>}
                    <td className="max-w-[360px]">
                      <div className="flex items-center gap-2"><Badge tone={j.kind === "delete" ? "red" : "gray"}>{j.kind === "delete" ? "Delete" : "Import"}</Badge><span className="truncate font-medium">{j.entityLabel}</span></div>
                      {j.fileName && <div className="truncate text-[12px] text-ink-3">{j.fileName}{j.sheetName ? `, ${j.sheetName}` : ""}</div>}
                    </td>
                    <td>{j.user}</td>
                    <td className="num text-right">{j.kind === "delete" ? `${j.counts.posted} deleted` : <>{j.counts.posted.toLocaleString()}<span className="text-ink-4"> / {j.counts.total.toLocaleString()}</span></>}</td>
                    <td><JobStatus status={j.status} kind={j.kind} /></td>
                    <td className="text-right">{j.kind === "import" && <Link href={`/import/${j._id}`}><Button size="sm" variant="ghost">Open</Button></Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="ledger-grid w-full">
              <thead><tr><th className="!p-0" /><th>When</th><th>Who</th><th>What</th>{scope === "all" && <th>Company</th>}<th>Details</th></tr></thead>
              <tbody>
                {data.list.map((a) => (
                  <tr key={a._id}>
                    <td className="rail bg-rule" />
                    <td className="whitespace-nowrap text-ink-2" title={new Date(a.ts).toLocaleString()}>{new Date(a.ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                    <td className="font-medium">{a.user}</td>
                    <td>{a.jobId ? <Link className="hover:underline" href={`/import/${a.jobId}`}>{a.action}</Link> : a.action}</td>
                    {scope === "all" && <td className="max-w-[200px] truncate">{a.companyName}</td>}
                    <td className="max-w-[460px] truncate text-ink-3">{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {data && data.total > page && (
          <div className="flex items-center justify-between border-t border-rule px-3 py-2 text-[12.5px] text-ink-3">
            <span className="num">{skip + 1}–{Math.min(data.total, skip + page)} of {data.total.toLocaleString()}</span>
            <div className="flex gap-1"><Button size="sm" variant="ghost" disabled={!skip} onClick={() => setSkip(skip - page)}>Previous</Button><Button size="sm" variant="ghost" disabled={skip + page >= data.total} onClick={() => setSkip(skip + page)}>Next</Button></div>
          </div>
        )}
      </div>
    </>
  );
}
