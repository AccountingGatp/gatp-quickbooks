/** Brand mark: a ledger page with a tick, in GATP green. */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="bm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5fd3a8" />
          <stop offset="1" stopColor="#0d7a5b" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#bm)" />
      <path d="M9 11.5h14M9 16h8M9 20.5h6" stroke="#fff" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
      <path d="M17.5 21l2.6 2.6 5-5.6" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function Brand({ dark }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      <div className="leading-none">
        <div className={`text-[15.5px] font-bold tracking-[-0.01em] ${dark ? "text-white" : "text-ink"}`}>GATP Ledger</div>
        <div className={`mt-1 text-[11px] ${dark ? "text-white/55" : "text-ink-3"}`}>QuickBooks bulk tools</div>
      </div>
    </div>
  );
}
