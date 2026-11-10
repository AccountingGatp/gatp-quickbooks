"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Landmark, CreditCard, FileUp, Download, Trash2, AlertCircle, ArrowRight, Upload, CheckCheck, Clock3, Archive, Activity, Inbox } from "lucide-react";
import { Badge, Empty, IconChip, JobStatus, Panel, Spinner, Stat, cx, type ChipTone } from "@/components/ui";
import { api, plural, when } from "@/lib/client";

const ACTIONS: { href: string; icon: any; title: string; text: string; tone: ChipTone }[] = [
  { href: "/import?type=bank-statement", icon: Landmark, title: "Bank statement", text: "Expenses, deposits and transfers", tone: "green" },
  { href: "/import?type=card-statement", icon: CreditCard, title: "Credit card statement", text: "Charges, refunds and payments", tone: "blue" },
  { href: "/import", icon: FileUp, title: "Any other file", text: "Bills, invoices, journals, lists", tone: "violet" },
  { href: "/export", icon: Download, title: "Export", text: "To Excel or CSV", tone: "teal" },
  { href: "/delete", icon: Trash2, title: "Bulk delete", text: "With an automatic backup", tone: "red" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Dashboard() {
  const [scope, setScope] = useState<"company" | "all">("company");
  const [d, setD] = useState<any>(null);
  const [co, setCo] = useState<{ name: string } | null | undefined>(undefined);
  useEffect(() => { api("/api/companies").then((r) => setCo(r.companies.find((c: any) => c.realmId === r.active) || null)); }, []);
  useEffect(() => { if (co === undefined) return; setD(null); api(`/api/stats?scope=${co ? scope : "all"}`).then(setD).catch(() => setD({ error: true })); }, [scope, co]);
  const max = d?.perDay ? Math.max(1, ...d.perDay.map((x: any) => x.rows)) : 1;
  const total14 = d?.perDay ? d.perDay.reduce((s: number, x: any) => s + x.rows, 0) : 0;

  return (
    <>
      {/* greeting */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13.5px] font-medium text-green">{greeting()}{d?.user ? `, ${d.user}` : ""}</p>
          <h1 className="mt-0.5 text-[28px] font-semibold leading-tight tracking-[-0.025em]">{co ? co.name : "Choose a client to begin"}</h1>
          <p className="mt-1 text-[13.5px] text-ink-3">{co ? "Here is what has gone into this company in the last 30 days." : "Pick a client company in the bar above, or connect a new one under Companies."}</p>
        </div>
        {co && (
          <div className="flex rounded-[10px] border border-rule bg-paper p-1 text-[12.5px] shadow-sm">
            {(["company", "all"] as const).map((s) => (
              <button key={s} onClick={() => setScope(s)} className={cx("rounded-[7px] px-3 py-1.5 font-medium transition-colors", scope === s ? "bg-forest text-white" : "text-ink-2 hover:bg-ledger")}>{s === "company" ? "This company" : "All companies"}</button>
            ))}
          </div>
        )}
      </div>

      {/* actions */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {ACTIONS.map(({ href, icon: I, title, text, tone }) => (
          <Link key={href} href={href} className="panel group flex flex-col gap-3 px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-green-line hover:shadow-[0_12px_28px_-14px_rgba(15,42,36,.28)]">
            <span className="flex items-start justify-between">
              <IconChip tone={tone} size="lg"><I strokeWidth={1.8} /></IconChip>
              <ArrowRight className="size-4 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-green" />
            </span>
            <span>
              <span className="block text-[14px] font-semibold leading-snug">{title}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{text}</span>
            </span>
          </Link>
        ))}
      </div>

      {!d ? <div className="py-16 text-center"><Spinner /></div> : d.error ? <Panel><Empty title="Could not load the dashboard">Check the MongoDB connection on the Settings page.</Empty></Panel> : (
        <>
          {d.companies.reconnect.length > 0 && (
            <div className="mb-6 flex items-start gap-3 rounded-[var(--radius-md)] border border-red-line bg-red-soft px-4 py-3 text-[13.5px]">
              <AlertCircle className="mt-0.5 size-4 text-red" />
              <span className="flex-1"><b className="font-semibold text-ink">{plural(d.companies.reconnect.length, "company needs", "companies need")} reconnecting:</b> {d.companies.reconnect.map((c: any) => c.name).join(", ")}.</span>
              <Link href="/companies" className="font-medium text-red hover:underline">Open companies</Link>
            </div>
          )}

          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat icon={<Upload />} chip="green" label="Imports" value={d.imports.toLocaleString()} sub="in the last 30 days" />
            <Stat icon={<CheckCheck />} chip="teal" label="Rows posted" value={d.rowsPosted.toLocaleString()} sub="to QuickBooks" />
            <Stat icon={<Clock3 />} chip="amber" label="Waiting for you" value={d.needsAttention.toLocaleString()} sub="in review or partly posted" tone={d.needsAttention ? "amber" : undefined} />
            <Stat icon={<Archive />} chip="violet" label="Records deleted" value={d.deleted.toLocaleString()} sub="backups kept in History" />
          </div>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div className="space-y-5">
              <Panel title="Rows posted, last 14 days" actions={<span className="num text-[13px] text-ink-3"><b className="font-semibold text-ink">{total14.toLocaleString()}</b> rows</span>}>
                <div className="flex h-[150px] items-end gap-2" role="img" aria-label="Rows posted per day, last 14 days">
                  {d.perDay.map((x: any) => {
                    const dt = new Date(x.date + "T12:00");
                    return (
                      <div key={x.date} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                        <span className={cx("num text-[11px] font-semibold", x.rows ? "text-ink-2" : "text-transparent")}>{x.rows || 0}</span>
                        <div className={cx("w-full max-w-[34px] rounded-t-[6px] transition-colors", x.rows ? "bg-gradient-to-t from-green to-mint group-hover:from-green-2" : "bg-rule-2")} style={{ height: `${x.rows ? Math.max(10, (x.rows / max) * 104) : 4}px` }} />
                        <span className={cx("num text-[10.5px]", dt.getDay() === 0 || dt.getDay() === 6 ? "text-ink-4" : "text-ink-3")}>{dt.getDate()}</span>
                      </div>
                    );
                  })}
                </div>
              </Panel>
              <Panel title="Waiting for you" pad={false} actions={<Link href="/history" className="text-[12.5px] font-medium text-green hover:underline">All history</Link>}>
                {d.open.length ? (
                  <ul>
                    {d.open.map((j: any) => (
                      <li key={j._id} className="border-b border-rule-2 last:border-0">
                        <Link href={`/import/${j._id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ledger">
                          <IconChip tone={j.counts.error ? "red" : "blue"} size="sm"><Inbox /></IconChip>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2"><span className="truncate text-[13.5px] font-semibold">{j.entityLabel}</span>{scope === "all" && <span className="truncate text-[12px] text-ink-3">{j.companyName}</span>}</div>
                            <div className="truncate text-[12px] text-ink-3">{j.fileName}, {plural(j.counts.total, "row")}, {j.user}, {when(j.createdAt)}</div>
                          </div>
                          {j.counts.error > 0 && <Badge tone="red">{j.counts.error} to fix</Badge>}
                          <JobStatus status={j.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : <Empty icon={<CheckCheck className="size-8 text-green" />} title="All caught up">Imports still in review, or only partly posted, show up here.</Empty>}
              </Panel>
            </div>
            <Panel title="Recent activity" pad={false} actions={<Link href="/history?tab=activity" className="text-[12.5px] font-medium text-green hover:underline">Activity log</Link>}>
              {d.activity.length ? (
                <ol className="relative px-5 py-3">
                  <span className="absolute bottom-5 left-[33px] top-5 w-px bg-rule-2" />
                  {d.activity.map((a: any) => (
                    <li key={a._id} className="relative flex gap-3 py-2">
                      <span className="z-[1] grid size-[18px] shrink-0 place-items-center rounded-full border-2 border-paper bg-green-soft"><span className="size-1.5 rounded-full bg-green" /></span>
                      <div className="min-w-0 flex-1 text-[13px] leading-snug">
                        <span className="font-semibold text-ink">{a.user}</span> <span className="text-ink-2">{a.action.toLowerCase()}</span>
                        {a.detail && <div className="truncate text-[12px] text-ink-3">{a.detail}</div>}
                        {scope === "all" && a.companyName && <div className="truncate text-[12px] text-ink-4">{a.companyName}</div>}
                      </div>
                      <span className="shrink-0 text-[11.5px] text-ink-4">{when(a.ts)}</span>
                    </li>
                  ))}
                </ol>
              ) : <Empty icon={<Activity className="size-8" />} title="No activity yet">Uploads, posts, undos and deletes are logged here, with who did them.</Empty>}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
