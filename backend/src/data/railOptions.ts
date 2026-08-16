import type { RailOption, RailType } from "../types";
import { LINKED_CORRIDORS, linkedKey, sharedLocalRail } from "./countries";

// ──────────────────────────────────────────────
// Rail options are generated per-corridor so any
// country pair works, not a hardcoded table.
//   local  — same-country OR payment-union (SEPA) instant rail
//   linked — a real bilateral instant-payment linkage
//   stable_bridge — universal fallback
// ──────────────────────────────────────────────

export function corridorOptions(a: string, b: string): RailOption[] {
  const opts: RailOption[] = [];

  const localName = sharedLocalRail(a, b);
  if (localName) {
    opts.push({
      type: "local",
      corridor: [a, b],
      railName: localName,
      feeEstimatePct: 0,
      timeEstimateHours: 1,
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
    });
  }

  opts.push({
    type: "stable_bridge",
    corridor: [a, b],
    railName: "USDC Bridge (Circle)",
    feeEstimatePct: 1.5,
    timeEstimateHours: 24,
  });

  return opts;
}

export interface RailPick {
  type: RailType;
  railName: string;
  feeEstimatePct: number;
  timeEstimateHours: number;
}

const CLAIM_LINK_PICK: RailPick = {
  type: "claim_link",
  railName: "Claim Link (recipient chooses payout)",
  feeEstimatePct: 1.0,
  timeEstimateHours: 48,
};

/** Cheapest rail this pair can actually use. */
export function cheapestRail(
  fromCountry: string,
  toCountry: string,
  recipientHasAccount: boolean,
): RailPick {
  if (!recipientHasAccount) return CLAIM_LINK_PICK;
  const opts = corridorOptions(fromCountry, toCountry);
  const best = [...opts].sort(
    (x, y) =>
      x.feeEstimatePct - y.feeEstimatePct ||
      x.timeEstimateHours - y.timeEstimateHours,
  )[0];
  return {
    type: best.type,
    railName: best.railName,
    feeEstimatePct: best.feeEstimatePct,
    timeEstimateHours: best.timeEstimateHours,
  };
}

export function feePctForPair(
  fromCountry: string,
  toCountry: string,
  recipientHasAccount: boolean,
): number {
  return cheapestRail(fromCountry, toCountry, recipientHasAccount)
    .feeEstimatePct;
}
