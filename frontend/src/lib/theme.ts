// ──────────────────────────────────────────────
// Shared theming helpers: country flags/names,
// avatar fills, and rail color tokens.
// ──────────────────────────────────────────────
import { COUNTRIES, flagFromCode } from "./countries";

export const COUNTRY_FLAGS: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, flagFromCode(c.code)]),
);

export function countryFlag(code: string): string {
  if (!code) return "";
  return COUNTRY_FLAGS[code] ?? flagFromCode(code);
}

export const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c.name]),
);

// Muted, solid fills — no neon gradients.
const AVATAR_FILL: string[] = [
  "#4d5344",
  "#5c5048",
  "#3f4a52",
  "#6a5346",
  "#4a4e45",
  "#534c43",
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

export function avatarFill(id: string): string {
  return AVATAR_FILL[hash(id) % AVATAR_FILL.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const first = parts[0][0] ?? "";
  const last = parts[parts.length - 1][0] ?? "";
  return (first + last).toUpperCase();
}

// Rail visual tokens shared across components.
export const RAIL_META: Record<
  string,
  {
    label: string;
    hex: string;
    text: string;
    dot: string;
    ring: string;
    soft: string;
  }
> = {
  local: {
    label: "Local Rail",
    hex: "#9aaa8c",
    text: "text-[#9aaa8c]",
    dot: "bg-[#9aaa8c]",
    ring: "ring-[#9aaa8c]/30",
    soft: "bg-[#9aaa8c]/10 border-[#9aaa8c]/25",
  },
  linked: {
    label: "Linked Rail",
    hex: "#8a9aab",
    text: "text-[#8a9aab]",
    dot: "bg-[#8a9aab]",
    ring: "ring-[#8a9aab]/30",
    soft: "bg-[#8a9aab]/10 border-[#8a9aab]/25",
  },
  claim_link: {
    label: "Claim Link",
    hex: "#c4a574",
    text: "text-[#c4a574]",
    dot: "bg-[#c4a574]",
    ring: "ring-[#c4a574]/30",
    soft: "bg-[#c4a574]/10 border-[#c4a574]/25",
  },
  stable_bridge: {
    label: "Stable Bridge",
    hex: "#a898a4",
    text: "text-[#a898a4]",
    dot: "bg-[#a898a4]",
    ring: "ring-[#a898a4]/30",
    soft: "bg-[#a898a4]/10 border-[#a898a4]/25",
  },
};
