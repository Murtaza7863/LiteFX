import { avatarFill, initials } from "../lib/theme";

// ──────────────────────────────────────────────
// Entity avatar — solid muted fill with initials.
// Deterministic color per entity id.
// ──────────────────────────────────────────────

interface Props {
  id: string;
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ id, name, size = 36, className = "" }: Props) {
  return (
    <div
      className={`font-display flex shrink-0 items-center justify-center rounded-full font-semibold text-[#eee8df] ${className}`}
      style={{
        width: size,
        height: size,
        background: avatarFill(id),
        fontSize: size * 0.36,
      }}
      aria-label={name}
      title={name}
    >
      {initials(name)}
    </div>
  );
}
