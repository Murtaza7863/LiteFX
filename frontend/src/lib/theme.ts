// ──────────────────────────────────────────────
// Shared theming helpers: country flags/names,
// avatar gradients, and rail color tokens.
// ──────────────────────────────────────────────
import { COUNTRIES, flagFromCode } from "./countries";

export const COUNTRY_FLAGS: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, flagFromCode(c.code)])
);

export const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c.name])
);

// A palette of pleasant gradient pairs for avatars.
const GRADIENTS: [string, string][] = [
  ["#22d3ee", "#3b82f6"], // cyan → blue
  ["#a855f7", "#6366f1"], // violet → indigo
  ["#34d399", "#10b981"], // emerald → teal
  ["#f59e0b", "#f97316"], // amber → orange
  ["#f43f5e", "#ec4899"], // rose → pink
  ["#8b5cf6", "#a855f7"], // purple → violet
];

// Deterministic hash so each entity keeps the same color.
function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function avatarGradient(id: string): string {
  const [a, b] = GRADIENTS[hash(id) % GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Rail visual tokens shared across components.
export const RAIL_META: Record<
  string,
  { label: string; text: string; dot: string; ring: string; soft: string }
> = {
  local: {
    label: "Local Rail",
    text: "text-emerald-300",
    dot: "bg-emerald-400",
    ring: "ring-emerald-400/30",
    soft: "bg-emerald-400/10 border-emerald-400/20",
  },
  linked: {
    label: "Linked Rail",
    text: "text-blue-300",
    dot: "bg-blue-400",
    ring: "ring-blue-400/30",
    soft: "bg-blue-400/10 border-blue-400/20",
  },
  claim_link: {
    label: "Claim Link",
    text: "text-amber-300",
    dot: "bg-amber-400",
    ring: "ring-amber-400/30",
    soft: "bg-amber-400/10 border-amber-400/20",
  },
  stable_bridge: {
    label: "Stable Bridge",
    text: "text-violet-300",
    dot: "bg-violet-400",
    ring: "ring-violet-400/30",
    soft: "bg-violet-400/10 border-violet-400/20",
  },
};
