import type { ComplianceFlag } from "../types";
import {
  CORRIDOR_LIMITS,
  FREQUENCY_THRESHOLD,
} from "../types";
import { getEntity, getStore, setComplianceFlags, setComplianceRan, updateNetObligation } from "../store";

// ──────────────────────────────────────────────
// Agent 4 — Compliance stub (lower priority)
//
// A rules-based check that runs before an obligation
// is marked "routed".  Flags (does not block):
//   - limit_exceeded: amount above mock per-corridor limit
//   - frequency_anomaly: same entity pair nets > N times
//
// MOCKED — in production this would integrate with a real
// compliance engine ( sanctions screening, transaction
// monitoring, regulatory reporting ).
// ──────────────────────────────────────────────

export function evaluateCompliance(): ComplianceFlag[] {
  const store = getStore();
  const flags: ComplianceFlag[] = [];

  // Track pair frequency (mocked rolling window — we just count
  // how many net obligations exist for each unordered pair).
  const pairCount = new Map<string, number>();

  for (const ob of store.netObligations) {
    const sender = getEntity(ob.from);
    const recipient = getEntity(ob.to);
    if (!sender || !recipient) continue;

    const key = `${sender.country}->${recipient.country}`;
    const limit = CORRIDOR_LIMITS[key];
    const pairKey = [ob.from, ob.to].sort().join("↔");
    const count = (pairCount.get(pairKey) ?? 0) + 1;
    pairCount.set(pairKey, count);

    // Attach compliance flags to the obligation
    const obFlags: ComplianceFlag[] = [];

    // Check 1 — per-corridor limit exceeded
    if (limit !== undefined) {
      const amountInSettlementCurrency = ob.amount;
      // Convert to the settlement currency's value in USD for comparison
      if (ob.amountUsd > limit) {
        const f: ComplianceFlag = {
          obligationId: ob.id,
          type: "limit_exceeded",
          message: `Amount ${ob.amountUsd.toFixed(2)} USD exceeds corridor limit ${limit} USD for ${key}.`,
          severity: "warning",
        };
        flags.push(f);
        obFlags.push(f);
      }
    }

    // Check 2 — frequency anomaly (same pair nets > threshold)
    if (count > FREQUENCY_THRESHOLD) {
      const f: ComplianceFlag = {
        obligationId: ob.id,
        type: "frequency_anomaly",
        message: `Entity pair has ${count} net obligations in the rolling window (threshold ${FREQUENCY_THRESHOLD}).`,
        severity: "warning",
      };
      flags.push(f);
      obFlags.push(f);
    }

    if (obFlags.length > 0) {
      updateNetObligation(ob.id, { complianceFlags: obFlags });
    }
  }

  setComplianceFlags(flags);
  return flags;
}

// Marks the compliance step as explicitly run (drives the stepper tick).
export function runCompliance(): ComplianceFlag[] {
  const flags = evaluateCompliance();
  setComplianceRan(true);
  return flags;
}
