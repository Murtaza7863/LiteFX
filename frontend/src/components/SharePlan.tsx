import { useState } from "react";

import type { SettlementInsight, SettlementPlan } from "../api/client";

import { appBase } from "../lib/urls";
import { IconShare } from "./icons";

export function SharePlanButton({
  plan,
  onCopied,
}: {
  plan?: SettlementPlan;
  onCopied: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!plan || !plan.text.includes("→")) return null;

  const handleCopy = async () => {
    setBusy(true);
    try {
      const origin = `${window.location.origin}${appBase()}`;
      const text = plan.text.split("/claim/").join(`${origin}/claim/`);
      await navigator.clipboard.writeText(text);
      onCopied("Settlement plan copied");
    } catch {
      onCopied("Could not copy plan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      disabled={busy}
      className="btn-ghost !px-3 !py-1.5 text-xs"
    >
      <IconShare className="h-3.5 w-3.5" />
      Copy plan
    </button>
  );
}

export function InsightsPanel({ insights }: { insights: SettlementInsight[] }) {
  if (insights.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {insights.map((tip) => (
        <p
          key={tip.recipientId}
          className="text-slate-400 text-[12px] leading-snug"
        >
          {tip.message}
          {tip.savingsUsd > 0 && (
            <span className="text-slate-500">
              {" "}
              (${tip.currentFeeUsd.toFixed(2)} → ${tip.linkedFeeUsd.toFixed(2)})
            </span>
          )}
        </p>
      ))}
    </div>
  );
}
