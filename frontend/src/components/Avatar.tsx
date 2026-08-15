import { avatarGradient, initials } from "../lib/theme";

// ──────────────────────────────────────────────
// Entity avatar — a gradient circle with initials.
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
      className={`flex items-center justify-center rounded-full text-white font-semibold shadow-glass shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        background: avatarGradient(id),
        fontSize: size * 0.36,
      }}
      aria-label={name}
      title={name}
    >
      {initials(name)}
    </div>
  );
}
