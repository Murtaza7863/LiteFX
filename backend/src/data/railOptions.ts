import type { RailOption, RailType } from "../types";
import { LOCAL_RAILS, LINKED_CORRIDORS, linkedKey } from "./countries";

// ──────────────────────────────────────────────
// Rail options are generated per-corridor so any
// country pair works, not a hardcoded table.
//   local  — same-country instant rail (per-country name)
//   linked — a real bilateral instant-payment linkage
//   stable_bridge — universal fallback
// ──────────────────────────────────────────────

export function corridorOptions(a: string, b: string): RailOption[] {
  const opts: RailOption[] = [];

  if (a === b) {
    opts.push({
      type: "local",
      corridor: [a, b],
      railName: LOCAL_RAILS[a] ?? "Local instant rail",
      feeEstimatePct: 0,
      timeEstimateHours: 1,
      requiresRecipientAccount: true,
    });
  }

  const linked = LINKED_CORRIDORS[linkedKey(a, b)];
  if (linked) {
    opts.push({
      type: "linked",
      corridor: [a, b],
      railName: linked,
      feeEstimatePct: 0.5,
      timeEstimateHours: 1,
      requiresRecipientAccount: true,
    });
  }

  opts.push({
    type: "stable_bridge",
    corridor: [a, b],
    railName: "USDC Bridge (Circle)",
    feeEstimatePct: 1.5,
    timeEstimateHours: 24,
    requiresRecipientAccount: true,
  });

  return opts;
}

// Among rails of a given type on a corridor, prefer lowest fee then time.
export function bestRail(a: string, b: string, type: RailType): RailOption | undefined {
  return corridorOptions(a, b)
    .filter((r) => r.type === type)
    .sort((x, y) => x.feeEstimatePct - y.feeEstimatePct || x.timeEstimateHours - y.timeEstimateHours)[0];
}
