"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Landmark, CreditCard, FileUp, Download, Trash2, AlertCircle, ArrowUpRight } from "lucide-react";
import { Badge, Empty, JobStatus, Panel, Spinner, Stat, cx } from "@/components/ui";
import { api, plural, when } from "@/lib/client";

export default function Dashboard() {
  const [scope, setScope] = useState<"company" | "all">("company");
  const [d, setD] = useState<any>(null);
  const [co, setCo] = useState<{ name: string } | null | undefined>(undefined);
  useEffect(() => { api("/api/companies").then((r) => setCo(r.companies.find((c: any) => c.realmId === r.active) || null)); }, []);
  useEffect(() => { setD(null); api(`/api/stats?scope=${co ? scope : "all"}`).then(setD).catch(() => setD({ error: true })); }, [scope, co]);
  const max = d?.perDay ? Math.max(1, ...d.perDay.map((x: any) => x.rows)) : 1;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight">{co ? co.name : "Dashboard"}</h1>
          <p className="mt-1 text-[13.5px] text-ink-3">{co ? "What has gone into this company in the last 30 days." : "Choose a client company at the top to start importing."}</p>
        </div>
        {co && (
          <div className="flex rounded-[var(--radius-sm)] border border-rule bg-paper p-0.5 text-[12.5px]">
            {(["company", "all"] as const).map((s) => (
              <button key={s} onClick={() => setScope(s)} className={cx("rounded-[4px] px-2.5 py-1 font-medium", scope === s ? "bg-ink text-white" : "text-ink-2 hover:bg-ledger")}>{s === "company" ? "This company" : "All companies"}</button>
            ))}
          </div>
        )}
      </div>

      {/* actions */}
      <div className="mb-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { href: "/import?type=bank-statement", icon: Landmark, title: "Bank statement", text: "Expenses, deposits, transfers" },
          { href: "/import?type=card-statement", icon: CreditCard, title: "Credit card statement", text: "Charges, refunds, payments" },
          { href: "/import", icon: FileUp, title: "Any other file", text: "Bills, invoices, journals, lists" },
          { href: "/export", icon: Download, title: "Export", text: "To Excel or CSV" },
          { href: "/delete", icon: Trash2, title: "Bulk delete", text: "Clean up, with a backup" },
        ].map(({ href, icon: I, title, text }, i) => (
          <Link key={href} href={href} className={cx("group flex items-center gap-3 rounded-[var(--radius-md)] border px-3.5 py-3", i === 0 ? "border-green bg-green text-white hover:bg-green-2" : "border-rule bg-paper hover:border-ink-4")}>
            <I className={cx("size-5 shrink-0", i === 0 ? "text-white" : "text-green")} strokeWidth={1.8} />
            <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-semibold leading-snug">{title}</span><span className={cx("block text-[12px] leading-snug", i === 0 ? "text-white/80" : "text-ink-3")}>{text}</span></span>
            <ArrowUpRight className={cx("size-4 opacity-0 transition-opacity group-hover:opacity-100", i === 0 ? "text-white" : "text-ink-3")} />
          </Link>
        ))}
      </div>

      {!d ? <div className="py-16 text-center"><Spinner /></div> : d.error ? <Panel><Empty title="Could not load the dashboard">Check the MongoDB connection in Settings.</Empty></Panel> : (
        <>
          {d.companies.reconnect.length > 0 && (
            <div className="mb-5 flex items-start gap-3 rounded-[var(--radius-md)] border border-red-line bg-red-soft px-4 py-3 text-[13.5px]">
              <AlertCircle className="mt-0.5 size-4 text-red" />
              <span className="flex-1"><b className="font-semibold text-ink">{plural(d.companies.reconnect.length, "company needs", "companies need")} reconnecting:</b> {d.companies.reconnect.map((c: any) => c.name).join(", ")}.</span>
              <Link href="/companies" className="font-medium text-red hover:underline">Open companies</Link>
            </div>
          )}

          <div className="panel mb-5 grid divide-y divide-rule-2 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-[repeat(4,minmax(0,1fr))_1.6fr] lg:divide-x">
            <Stat label="Imports" value={d.imports.toLocaleString()} sub="last 30 days" />
            <Stat label="Rows posted" value={d.rowsPosted.toLocaleString()} sub="to QuickBooks" />
            <Stat label="Waiting for you" value={d.needsAttention.toLocaleString()} sub="in review or partly posted" tone={d.needsAttention ? "amber" : undefined} />
            <Stat label="Records deleted" value={d.deleted.toLocaleString()} sub="with backups kept" />
            <div className="px-4 py-3.5">
              <div className="flex items-baseline justify-between text-[12.5px] text-ink-3"><span>Rows posted per day</span><span>last 14 days</span></div>
              <div className="mt-2 flex h-[54px] items-end gap-[3px]" role="img" aria-label="Rows posted per day">
                {d.perDay.map((x: any) => (
                  <div key={x.date} className="group relative flex-1">
                    <div className={cx("w-full rounded-t-[2px]", x.rows ? "bg-green" : "bg-rule-2")} style={{ height: `${x.rows ? Math.max(8, (x.rows / max) * 54) : 3}px` }} />
                    <span className="num pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[11px] text-white group-hover:block">{new Date(x.date + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}: {x.rows}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Panel title="Waiting for you" pad={false} actions={<Link href="/history" className="text-[12.5px] font-medium text-green hover:underline">All history</Link>}>
              {d.open.length ? (
                <ul>
                  {d.open.map((j: any) => (
                    <li key={j._id} className="border-b border-rule-2 last:border-0">
                      <Link href={`/import/${j._id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-ledger">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2"><span className="truncate text-[13.5px] font-medium">{j.entityLabel}</span>{scope === "all" && <span className="truncate text-[12px] text-ink-3">{j.companyName}</span>}</div>
                          <div className="truncate text-[12px] text-ink-3">{j.fileName}, {plural(j.counts.total, "row")}, {j.user}, {when(j.createdAt)}</div>
                        </div>
                        {j.counts.error > 0 && <Badge tone="red">{j.counts.error} to fix</Badge>}
                        <JobStatus status={j.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <Empty title="All caught up">Imports that are still in review, or only partly posted, show up here.</Empty>}
            </Panel>
            <Panel title="Recent activity" pad={false} actions={<Link href="/history?tab=activity" className="text-[12.5px] font-medium text-green hover:underline">Activity log</Link>}>
              {d.activity.length ? (
                <ul className="py-1">
                  {d.activity.map((a: any) => (
                    <li key={a._id} className="flex gap-3 px-4 py-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-green-line" />
                      <div className="min-w-0 flex-1 text-[13px]">
                        <span className="font-medium text-ink">{a.user}</span> <span className="text-ink-2">{a.action.toLowerCase()}</span>
                        {a.detail && <span className="text-ink-3">: {a.detail}</span>}
                        {scope === "all" && a.companyName && <div className="truncate text-[12px] text-ink-3">{a.companyName}</div>}
                      </div>
                      <span className="shrink-0 text-[12px] text-ink-4">{when(a.ts)}</span>
                    </li>
                  ))}
                </ul>
              ) : <Empty title="No activity yet">Uploads, posts, undos and deletes are logged here with who did them.</Empty>}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
