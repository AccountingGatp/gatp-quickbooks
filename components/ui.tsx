"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2, X, CheckCircle2, AlertTriangle, Info } from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "quiet"; size?: "sm" | "md" | "lg"; icon?: ReactNode; loading?: boolean };
export function Button({ variant = "secondary", size = "md", icon, loading, className, children, disabled, ...p }: BtnProps) {
  const v = {
    primary: "bg-green text-white hover:bg-green-2 border border-green-2/40 shadow-[0_1px_2px_rgba(9,99,74,.25),inset_0_1px_0_rgba(255,255,255,.12)]",
    secondary: "bg-paper text-ink border border-rule hover:border-ink-4 hover:bg-ledger",
    ghost: "text-ink-2 hover:bg-ledger hover:text-ink",
    quiet: "text-green hover:bg-green-soft",
    danger: "bg-red text-white hover:bg-[#932f27] border border-[#7c2620]/40",
  }[variant];
  const s = { sm: "h-7 px-2.5 text-[12.5px] gap-1.5", md: "h-8.5 px-3 text-[13.5px] gap-2", lg: "h-10 px-4 text-[14.5px] gap-2" }[size];
  return (
    <button {...p} disabled={disabled || loading} className={cx("inline-flex items-center justify-center rounded-[var(--radius-sm)] font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none", v, s, className)}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

const TONES = {
  green: "bg-green-soft text-green border-green-line",
  red: "bg-red-soft text-red border-red-line",
  amber: "bg-amber-soft text-amber border-amber-line",
  blue: "bg-blue-soft text-blue border-[#bcd0e3]",
  gray: "bg-ledger text-ink-2 border-rule",
};
export type Tone = keyof typeof TONES;
export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-[1px] text-[11.5px] font-medium whitespace-nowrap", TONES[tone], className)}>{children}</span>;
}

export const JOB_STATUS: Record<string, { label: string; tone: Tone }> = {
  mapping: { label: "Map Fields", tone: "gray" },
  review: { label: "Review", tone: "blue" },
  posting: { label: "Posting", tone: "blue" },
  completed: { label: "Posted", tone: "green" },
  partial: { label: "Partly posted", tone: "amber" },
  failed: { label: "Not posted", tone: "red" },
  rolled_back: { label: "Undone", tone: "gray" },
  discarded: { label: "Discarded", tone: "gray" },
};
export function JobStatus({ status, kind }: { status: string; kind?: string }) {
  const s = JOB_STATUS[status] || { label: status, tone: "gray" as Tone };
  const label = kind === "delete" && status === "completed" ? "Deleted" : kind === "export" ? "Exported" : s.label;
  return <Badge tone={s.tone}>{label}</Badge>;
}

export const CHIP = {
  green: "bg-green-soft text-green", blue: "bg-blue-soft text-blue", violet: "bg-violet-soft text-violet",
  teal: "bg-teal-soft text-teal", red: "bg-red-soft text-red", amber: "bg-amber-soft text-amber", gray: "bg-ledger text-ink-2",
};
export type ChipTone = keyof typeof CHIP;
export function IconChip({ tone = "green", children, size = "md" }: { tone?: ChipTone; children: ReactNode; size?: "sm" | "md" | "lg" }) {
  const s = { sm: "size-7 rounded-[8px] [&_svg]:size-[15px]", md: "size-9 rounded-[10px] [&_svg]:size-[18px]", lg: "size-11 rounded-[12px] [&_svg]:size-[21px]" }[size];
  return <span className={cx("grid shrink-0 place-items-center", s, CHIP[tone])}>{children}</span>;
}

export function PageHeader({ title, sub, actions, children, icon, tone }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; icon?: ReactNode; tone?: ChipTone }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3.5">
        {icon && <IconChip tone={tone} size="lg">{icon}</IconChip>}
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</h1>
          {sub && <p className="mt-1 max-w-[76ch] text-[13.5px] text-ink-3">{sub}</p>}
          {children}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("panel", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-rule-2 px-5 py-3">
          <h2 className="text-[14.5px] font-semibold text-ink">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[12.5px] font-medium text-ink-2">
      {children}{hint && <span className="ml-1 font-normal text-ink-4">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, help, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; help?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-3", disabled && "opacity-60 pointer-events-none")}>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx("mt-0.5 inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors", checked ? "border-green bg-green" : "border-rule bg-rule-2")}>
        <span className={cx("size-3.5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[15px]" : "translate-x-[1px]")} />
      </button>
      <span>
        <span className="block text-[13.5px] text-ink">{label}</span>
        {help && <span className="block text-[12.5px] text-ink-3">{help}</span>}
      </span>
    </label>
  );
}

export function Spinner({ className }: { className?: string }) { return <Loader2 className={cx("size-4 animate-spin text-ink-3", className)} />; }

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-ink-4">{icon}</div>}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {children && <p className="mt-1 max-w-[52ch] text-[13.5px] text-ink-3">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide, xl }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean; xl?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 p-4 pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal className={cx("toast-in w-full rounded-[var(--radius-lg)] border border-rule bg-paper shadow-[0_18px_50px_-12px_rgba(22,38,44,.35)]", xl ? "max-w-6xl" : wide ? "max-w-2xl" : "max-w-md")}>
        <header className="flex items-center justify-between border-b border-rule-2 px-5 py-3">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-ink-3 hover:bg-ledger" aria-label="Close"><X className="size-4" /></button>
        </header>
        <div className="px-5 py-4 text-[13.5px] text-ink-2">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-rule-2 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Progress({ value, live, tone = "green" }: { value: number; live?: boolean; tone?: "green" | "red" }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-rule-2">
      <div className={cx("h-full rounded-full transition-[width] duration-500", tone === "green" ? "bg-green" : "bg-red", live && "bar-live")} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="flex gap-1 border-b border-rule">
      {items.map((it) => (
        <button key={it.value} onClick={() => onChange(it.value)}
          className={cx("-mb-px flex items-center gap-1.5 px-3 py-2 text-[13.5px] font-medium", value === it.value ? "tab-active text-ink" : "text-ink-3 hover:text-ink")}>
          {it.label}
          {it.count != null && <span className={cx("num rounded-full px-1.5 text-[11px]", value === it.value ? "bg-green-soft text-green" : "bg-ledger text-ink-3")}>{it.count.toLocaleString()}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- toasts
type Toast = { id: number; tone: "ok" | "error" | "info"; text: string };
const ToastCtx = createContext<(tone: Toast["tone"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const n = useRef(0);
  const push = useCallback((tone: Toast["tone"], text: string) => {
    const id = ++n.current;
    setList((l) => [...l.slice(-3), { id, tone, text }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), tone === "error" ? 9000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={cx("toast-in pointer-events-auto flex items-start gap-2.5 rounded-[var(--radius-md)] border bg-paper px-3.5 py-2.5 text-[13.5px] shadow-[0_10px_30px_-10px_rgba(22,38,44,.35)]",
            t.tone === "error" ? "border-red-line" : t.tone === "ok" ? "border-green-line" : "border-rule")}>
            {t.tone === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green" /> : t.tone === "error" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red" /> : <Info className="mt-0.5 size-4 shrink-0 text-blue" />}
            <span className="whitespace-pre-line text-ink">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Stat({ label, value, sub, tone, icon, chip = "green" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "red" | "amber"; icon?: ReactNode; chip?: ChipTone }) {
  return (
    <div className="panel flex items-start gap-3.5 px-5 py-4">
      {icon && <IconChip tone={chip}>{icon}</IconChip>}
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-ink-3">{label}</div>
        <div className={cx("num mt-0.5 text-[26px] font-semibold leading-tight tracking-[-0.02em]", tone === "red" ? "text-red" : tone === "amber" ? "text-amber" : "text-ink")}>{value}</div>
        {sub && <div className="mt-0.5 text-[12px] text-ink-3">{sub}</div>}
      </div>
    </div>
  );
}

