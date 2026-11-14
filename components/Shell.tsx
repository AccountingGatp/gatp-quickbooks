"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LayoutDashboard, Upload, Download, Trash2, History, Wand2, Building2, Settings2, Search, Check, LogOut, Plus, AlertCircle, Menu, X, ChevronDown, FileText, FilePenLine } from "lucide-react";
import { Brand } from "./Brand";
import { ToastProvider, cx, useToast } from "./ui";
import { NAV_GROUPS, activeNavigation } from "@/lib/navigation";
import { api } from "@/lib/client";

export type ShellCompany = { realmId: string; name: string; environment: string; status: string };

const NAV_ICONS = { dashboard: LayoutDashboard, upload: Upload, download: Download, delete: Trash2, modify: FilePenLine, file: FileText, history: History, rules: Wand2, companies: Building2, settings: Settings2 };

export function Shell({ user, companies, active, mock, children }: { user: string; companies: ShellCompany[]; active: string | null; mock: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => setOpen(false), [path, query]);
  const selected = activeNavigation(path, query);
  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <aside className={cx("fixed inset-y-0 left-0 z-40 flex w-[200px] flex-col bg-forest px-2 py-4 transition-transform overflow-y-auto lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}
          style={{ backgroundImage: "radial-gradient(120% 50% at 0% 0%, rgba(95,211,168,.13), transparent 60%)" }}>
          <div className="flex items-center justify-between px-2"><Brand dark /><button className="lg:hidden p-1 text-white" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-4" /></button></div>
          <nav aria-label="Main navigation" className="mt-7 mb-6 space-y-1">
            {NAV_GROUPS.map((group) => <details key={`${group.label}-${selected}`} open={group.items.some((item) => "href" in item && item.href === selected)} className="sidebar-section group/section">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded px-3 py-3 text-[13px] font-semibold text-white/90 hover:bg-white/5 [&::-webkit-details-marker]:hidden">{group.label}<ChevronDown className="size-3.5 transition-transform group-open/section:rotate-180" /></summary>
              <div className="space-y-0.5 pb-1">
                {group.items.map((item) => {
                  const I = NAV_ICONS[item.icon as keyof typeof NAV_ICONS];
                  const href = "href" in item ? item.href : undefined;
                  const activeItem = href === selected;
                  return href ? <Link key={item.label} href={href} aria-current={activeItem ? "page" : undefined} className={cx("flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium", activeItem ? "bg-green text-white" : "text-white/70 hover:bg-white/5 hover:text-white")}><I className="size-4 shrink-0" />{item.label}</Link>
                    : <div key={item.label} className="px-3 py-2 text-white/40"><button type="button" disabled title={"unavailable" in item ? item.unavailable : "Not available yet"} className="flex items-center gap-2 text-[13px]"><I className="size-4" />{item.label}</button><p className="mt-1 pl-6 text-[10px]">Not available yet</p></div>;
                })}
              </div>
            </details>)}
          </nav>
          <div className="mt-auto rounded-[10px] border border-white/10 bg-white/[.04] px-3 py-3 text-[12px] leading-relaxed text-white/60">
            {mock ? <><b className="text-[#f5c45e]">Demo mode.</b> QuickBooks is simulated; nothing reaches a real company.</> : <><span className="mb-1 flex items-center gap-1.5 font-semibold text-white"><span className="size-1.5 rounded-full bg-mint" />Connected to QuickBooks</span>{companies.length} client {companies.length === 1 ? "company" : "companies"}</>}
          </div>
        </aside>
        {open && <div className="fixed inset-0 z-30 bg-ink/30 lg:hidden" onClick={() => setOpen(false)} />}
        <div className="flex min-w-0 flex-1 flex-col lg:pl-[200px]">
          <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3 border-b border-rule bg-paper/90 px-4 backdrop-blur-md lg:px-7">
            <button className="lg:hidden rounded p-1.5 hover:bg-ledger" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
            <CompanySwitcher companies={companies} active={active} />
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden items-center gap-2.5 sm:flex">
                <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-mint to-green text-[12px] font-bold text-white">{initials(user)}</span>
                <span className="leading-tight"><span className="block text-[13px] font-semibold text-ink">{user}</span><span className="block text-[11.5px] text-ink-3">GATP Solutions</span></span>
              </span>
              <button onClick={async () => { await api("/api/auth/logout", { json: {} }); location.href = "/login"; }} className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-rule px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-ledger" title="Log out">
                <LogOut className="size-4" /><span className="hidden md:inline">Log out</span>
              </button>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-7 lg:px-8">{children}</main>
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
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Current Account" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        className={cx("flex min-w-0 w-[180px] sm:w-[280px] max-w-full items-center gap-2.5 rounded-[10px] border px-2.5 py-1.5 text-left transition-colors hover:border-green-line", cur ? "border-transparent bg-paper" : "border-amber-line bg-amber-soft")}>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] leading-none text-ink-3">Current Account</span>
          <span className="mt-0.5 block truncate text-[13.5px] font-semibold leading-tight">{cur ? cur.name : "Choose a company"}</span>
        </span>
        {cur?.status === "needs_reconnect" && <AlertCircle className="size-4 text-red" />}
        <ChevronDown className="size-4 text-ink-3" />
      </button>
      {open && (
        <div className="toast-in absolute left-0 top-[calc(100%+6px)] z-50 w-[min(380px,calc(100vw-32px))] overflow-hidden rounded-[var(--radius-md)] border border-rule bg-paper shadow-[0_18px_40px_-14px_rgba(22,38,44,.35)]">
          <div className="flex items-center gap-2 border-b border-rule-2 px-3 py-2">
            <Search className="size-4 text-ink-4" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${companies.length} companies`} className="w-full bg-transparent py-1 text-[13.5px] outline-none placeholder:text-ink-4"
              onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); if (e.key === "Enter" && list[0] && !busy) pick(list[0]); }} />
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

