"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LayoutDashboard, Upload, Download, Trash2, History, Wand2, Building2, Settings2, ChevronsUpDown, Search, Check, LogOut, Plus, AlertCircle, Menu, X } from "lucide-react";
import { Brand } from "./Brand";
import { ToastProvider, cx, useToast } from "./ui";
import { api } from "@/lib/client";

export type ShellCompany = { realmId: string; name: string; environment: string; status: string };

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/import", label: "Import", icon: Upload },
  { href: "/export", label: "Export", icon: Download },
  { href: "/delete", label: "Delete", icon: Trash2 },
  { href: "/history", label: "History", icon: History },
  { href: "/rules", label: "Bank rules", icon: Wand2 },
];
const NAV2 = [
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function Shell({ user, companies, active, mock, children }: { user: string; companies: ShellCompany[]; active: string | null; mock: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const nav = (items: typeof NAV) => items.map(({ href, label, icon: I }) => (
    <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
      className={cx("relative flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-[7px] text-[13.5px] font-medium",
        isActive(href) ? "bg-green-soft text-green" : "text-ink-2 hover:bg-ledger hover:text-ink")}>
      {isActive(href) && <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r bg-green" />}
      <I className="size-[17px]" strokeWidth={1.9} />{label}
    </Link>
  ));
  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <aside className={cx("fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col border-r border-rule bg-paper px-3 py-4 transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
          <div className="flex items-center justify-between px-1.5"><Brand /><button className="lg:hidden p-1" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-4" /></button></div>
          <nav className="mt-6 flex flex-col gap-0.5">{nav(NAV)}</nav>
          <div className="my-4 border-t border-rule-2" />
          <nav className="flex flex-col gap-0.5">{nav(NAV2)}</nav>
          <div className="mt-auto rounded-[var(--radius-md)] border border-rule-2 bg-ledger px-3 py-2.5 text-[12px] text-ink-3">
            {mock ? <><b className="text-amber">Demo mode.</b> QuickBooks is simulated; nothing reaches a real company.</> : <>Signed in to QuickBooks as GATP Solutions. {companies.length} {companies.length === 1 ? "company" : "companies"} connected.</>}
          </div>
        </aside>
        {open && <div className="fixed inset-0 z-30 bg-ink/20 lg:hidden" onClick={() => setOpen(false)} />}
        <div className="flex min-w-0 flex-1 flex-col lg:pl-[232px]">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-rule bg-paper/95 px-4 backdrop-blur lg:px-6">
            <button className="lg:hidden rounded p-1.5 hover:bg-ledger" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
            <CompanySwitcher companies={companies} active={active} />
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-[13px] text-ink-3 sm:inline">Signed in as <b className="font-semibold text-ink">{user}</b></span>
              <button onClick={async () => { await api("/api/auth/logout", { json: {} }); location.href = "/login"; }} className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] text-ink-2 hover:bg-ledger" title="Log out">
                <LogOut className="size-4" /><span className="hidden sm:inline">Log out</span>
              </button>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-7">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}

function CompanySwitcher({ companies, active }: { companies: ShellCompany[]; active: string | null }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const box = useRef<HTMLDivElement>(null);
  const cur = companies.find((c) => c.realmId === active);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const list = useMemo(() => companies.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())), [companies, q]);
  async function pick(c: ShellCompany) {
    setBusy(true);
    try {
      await api("/api/companies", { json: { action: "select", realmId: c.realmId } });
      setOpen(false); setQ("");
      toast("ok", `Now working in ${c.name}`);
      if (/^\/import\/.+/.test(location.pathname)) router.push("/import"); else router.refresh();
    } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className={cx("flex min-w-[260px] max-w-[420px] items-center gap-2.5 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-left hover:border-ink-4", cur ? "border-rule bg-paper" : "border-amber-line bg-amber-soft")}>
        <span className={cx("grid size-7 shrink-0 place-items-center rounded-[6px] text-[12px] font-bold", cur ? "bg-ink text-white" : "bg-amber text-white")}>
          {cur ? initials(cur.name) : "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] leading-none text-ink-3">Client company</span>
          <span className="mt-0.5 block truncate text-[13.5px] font-semibold leading-tight">{cur ? cur.name : "Choose a company"}</span>
        </span>
        {cur?.status === "needs_reconnect" && <AlertCircle className="size-4 text-red" />}
        <ChevronsUpDown className="size-4 text-ink-3" />
      </button>
      {open && (
        <div className="toast-in absolute left-0 top-[calc(100%+6px)] z-50 w-[380px] overflow-hidden rounded-[var(--radius-md)] border border-rule bg-paper shadow-[0_18px_40px_-14px_rgba(22,38,44,.35)]">
          <div className="flex items-center gap-2 border-b border-rule-2 px-3 py-2">
            <Search className="size-4 text-ink-4" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${companies.length} companies`} className="w-full bg-transparent py-1 text-[13.5px] outline-none placeholder:text-ink-4"
              onKeyDown={(e) => { if (e.key === "Enter" && list[0]) pick(list[0]); }} />
          </div>
          <ul className="max-h-[360px] overflow-y-auto py-1">
            {list.map((c) => (
              <li key={c.realmId}>
                <button disabled={busy} onClick={() => pick(c)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-ledger">
                  <span className="grid size-6 shrink-0 place-items-center rounded-[5px] bg-ledger text-[10.5px] font-bold text-ink-2">{initials(c.name)}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{c.name}</span>
                  {c.status === "needs_reconnect" && <span className="text-[11px] text-red">Reconnect</span>}
                  {c.environment === "sandbox" && <span className="text-[11px] text-ink-4">sandbox</span>}
                  {c.realmId === active && <Check className="size-4 text-green" />}
                </button>
              </li>
            ))}
            {!list.length && <li className="px-3 py-6 text-center text-[13px] text-ink-3">{companies.length ? "No company matches." : "No companies connected yet."}</li>}
          </ul>
          <Link href="/companies" onClick={() => setOpen(false)} className="flex items-center gap-2 border-t border-rule-2 px-3 py-2.5 text-[13px] font-medium text-green hover:bg-green-soft">
            <Plus className="size-4" /> Connect or manage companies
          </Link>
        </div>
      )}
    </div>
  );
}

export const initials = (n: string) => n.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
