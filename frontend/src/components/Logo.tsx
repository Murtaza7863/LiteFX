// ──────────────────────────────────────────────
// LiteFX brand mark: several thin debt-lines on the
// left converge into a single bold transfer arrow on
// the right — "many debts, one settlement".
// ──────────────────────────────────────────────

function LogoGlyph({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 5.5 L12 12" strokeWidth="1.4" opacity="0.75" />
      <path d="M3 12 L12 12" strokeWidth="1.4" opacity="0.75" />
      <path d="M3 18.5 L12 12" strokeWidth="1.4" opacity="0.75" />
      <path d="M12 12 H19" strokeWidth="2.4" />
      <path d="M16.2 8.8 L19.6 12 L16.2 15.2" strokeWidth="2.4" />
    </svg>
  );
}

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg"
      style={{
        width: size,
        height: size,
        background: "var(--mark)",
        color: "var(--mark-ink)",
      }}
    >
      <LogoGlyph className="h-[58%] w-[58%]" />
    </div>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-display font-semibold tracking-[-0.035em] ${className}`}
    >
      Lite<span className="font-medium italic">FX</span>
    </span>
  );
}
