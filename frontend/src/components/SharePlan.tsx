import { useState } from "react";

import type {
  Entity,
  NetObligation,
  SettlementInsight,
  SettlementPlan,
} from "../api/client";
import { allSendSlips } from "../lib/paymentSlip";
import { appBase } from "../lib/urls";
import { IconFileText, IconShare } from "./icons";

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

export function CopySlipsButton({
  obligations,
  entityOf,
  onCopied,
}: {
  obligations: NetObligation[];
  entityOf: (id: string) => Entity | undefined;
  onCopied: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const text = allSendSlips(obligations, entityOf);
  if (!text) return null;

  const handleCopy = async () => {
    setBusy(true);
    try {
      await navigator.clipboard.writeText(text);
      onCopied("Send slips copied");
    } catch {
      onCopied("Could not copy slips");
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
      <IconFileText className="h-3.5 w-3.5" />
      Copy slips
    </button>
  );
}

export function InsightsPanel({
  insights,
  onLink,
}: {
  insights: SettlementInsight[];
  onLink?: (recipientId: string) => void;
}) {
  if (insights.length === 0) return null;
  return (
    <div className="space-y-2">
      {insights.map((tip) => (
        <div
          key={tip.recipientId}
          className="flex flex-wrap items-start justify-between gap-2"
        >
          <p className="text-slate-400 min-w-0 flex-1 text-[12px] leading-snug">
            {tip.message}
            {tip.savingsUsd > 0 && (
              <span className="text-slate-500">
                {" "}
                (${tip.currentFeeUsd.toFixed(2)} → $
                {tip.linkedFeeUsd.toFixed(2)})
              </span>
            )}
          </p>
          {onLink && (
            <button
              type="button"
              onClick={() => onLink(tip.recipientId)}
              className="btn-ghost shrink-0 !px-2.5 !py-1 text-[11px]"
            >
              Link {tip.suggestedRail}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
