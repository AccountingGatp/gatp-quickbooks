/** Ledger-paper mark: two green ruled lines and the red margin rule. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#0e6e55" />
      <rect x="5" y="5" width="22" height="22" rx="3" fill="#f1f5f0" />
      <path d="M5 12.5h22M5 18h22M5 23.5h22" stroke="#a9d3c2" strokeWidth="1.6" />
      <path d="M11 5v22" stroke="#ad3a30" strokeWidth="1.8" />
      <path d="M14.5 15.2l2.4 2.4 5-5.2" stroke="#0e6e55" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      <div className="leading-none">
        <div className="text-[15px] font-bold tracking-[-0.01em] text-ink">GATP Ledger</div>
        <div className="mt-0.5 text-[11px] text-ink-3">QuickBooks bulk tools</div>
      </div>
    </div>
  );
}
