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
      {/* converging debts */}
      <path d="M3 5.5 L12 12" strokeWidth="1.4" opacity="0.75" />
      <path d="M3 12 L12 12" strokeWidth="1.4" opacity="0.75" />
      <path d="M3 18.5 L12 12" strokeWidth="1.4" opacity="0.75" />
      {/* single bold settlement */}
      <path d="M12 12 H19" strokeWidth="2.4" />
      <path d="M16.2 8.8 L19.6 12 L16.2 15.2" strokeWidth="2.4" />
    </svg>
  );
}

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <div
      className="brand-gradient text-white shadow-glow-cyan relative flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size }}
    >
      <LogoGlyph className="h-[58%] w-[58%]" />
      {/* subtle top sheen */}
      <div className="from-white/25 pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-b to-transparent" />
    </div>
  );
}
