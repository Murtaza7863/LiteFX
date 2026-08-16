import { useEffect, useState } from "react";

import type { ClaimDetails } from "../api/client";

import { client } from "../api/client";
import { Avatar } from "./Avatar";
import {
  IconLandmark,
  IconSmartphone,
  IconBanknote,
  IconHeart,
  IconTicket,
  IconCheckCircle,
  IconX,
} from "./icons";

function payoutIcon(opt: string) {
  const s = opt.toLowerCase();
  if (s.includes("charity") || s.includes("donate")) return IconHeart;
  if (
    s.includes("cash pickup") ||
    s.includes("western union") ||
    s.includes("moneygram")
  )
    return IconBanknote;
  if (
    s.includes("bank transfer") ||
    s.includes("sepa") ||
    s.includes("ach") ||
    s.includes("fednow")
  )
    return IconLandmark;
  return IconSmartphone;
}

interface Props {
  token: string;
  onClose: () => void;
  onClaimed: () => void;
}

export function ClaimLinkModal({ token, onClose, onClaimed }: Props) {
  const [details, setDetails] = useState<ClaimDetails | null>(null);
  const [selectedPayout, setSelectedPayout] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    client
      .getClaim(token)
      .then((d) => {
        setDetails(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [token]);

  const handleClaim = () => {
    if (!selectedPayout) return;
    setClaiming(true);
    client
      .claimWithPayout(token, selectedPayout)
      .then((res) => {
        if (res.success) {
          setClaimed(true);
          // Merge the returned link (with payoutMethod) so the success state shows it.
          if (res.link) setDetails((d) => (d ? { ...d, link: res.link! } : d));
          onClaimed();
        } else {
          setError(res.message);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setClaiming(false));
  };

  return (
    <div
      className="bg-black/70 animate-fade-in fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-strong shadow-glass animate-scale-in relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient accent bar */}
        <div className="from-amber-400 via-orange-400 to-rose-400 absolute inset-x-0 top-0 h-1 rounded-t-3xl bg-gradient-to-r" />

        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          aria-label="Close"
        >
          <IconX className="h-4 w-4" />
        </button>

        {loading && (
          <div className="text-slate-400 py-12 text-center text-sm">
            Loading claim link…
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border-red-500/25 mt-2 mb-4 rounded-xl border p-3">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {details && details.recipient && details.obligation && !loading && (
          <>
            {/* Header */}
            <div className="mt-2 mb-5">
              <div className="mb-2 flex items-center gap-2">
                <span className="chip bg-amber-500/15 border-amber-500/30 text-amber-300 border">
                  <IconTicket className="h-3.5 w-3.5" /> Claim Link
                </span>
                <span
                  className={`chip border ${
                    details.link.status === "pending"
                      ? "bg-slate-500/15 text-slate-400 border-slate-500/20"
                      : details.link.status === "claimed"
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
                        : "bg-red-500/15 text-red-300 border-red-500/25"
                  }`}
                >
                  {details.link.status}
                </span>
              </div>
              <h2 className="text-slate-50 text-2xl font-bold tracking-tight">
                You've been paid
              </h2>
              <div className="mt-2 flex items-center gap-2">
                <Avatar
                  id={details.recipient.id}
                  name={details.recipient.name}
                  size={28}
                />
                <p className="text-slate-400 text-sm">
                  Hi{" "}
                  <span className="text-slate-200 font-medium">
                    {details.recipient.name.trim()}
                  </span>
                  , a travel settlement is waiting for you. No signup needed.
                </p>
              </div>
            </div>

            {/* Amount */}
            <div className="bg-black/30 border-white/[0.05] mb-5 rounded-2xl border p-5 text-center">
              <p className="text-slate-500 mb-1 text-xs tracking-wider uppercase">
                Amount due to you
              </p>
              <p className="brand-text font-mono text-4xl font-bold tracking-tight">
                {details.obligation.amount.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
                <span className="ml-1.5 text-xl">
                  {details.obligation.settlementCurrency}
                </span>
              </p>
              <p className="text-slate-500 mt-1 font-mono text-xs">
                ≈ ${details.obligation.amountUsd.toFixed(2)} USD · expires{" "}
                {new Date(details.link.expiresAt).toLocaleDateString()}
              </p>
            </div>

            {/* Real, shareable claim URL */}
            <div className="bg-white/[0.03] border-white/[0.05] mb-5 flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <span className="text-slate-500 truncate font-mono text-[11px]">
                {typeof window !== "undefined"
                  ? `${window.location.origin}/claim/${token.slice(0, 10)}…`
                  : `/claim/${token.slice(0, 12)}…`}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/claim/${token}`;
                    void navigator.clipboard.writeText(url);
                  }}
                  className="text-slate-400 hover:text-slate-200 text-[11px] font-medium"
                >
                  Copy
                </button>
                <a
                  href={`/claim/${token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 text-[11px] font-medium whitespace-nowrap hover:underline"
                >
                  Open ↗
                </a>
              </div>
            </div>

            {claimed ? (
              <div className="bg-emerald-500/10 border-emerald-500/25 animate-scale-in rounded-2xl border p-5 text-center">
                <IconCheckCircle className="text-emerald-300 mx-auto mb-2 h-8 w-8" />
                <p className="text-emerald-300 text-lg font-semibold">
                  Claimed!
                </p>
                <p className="text-slate-400 mt-1 text-sm">
                  Payout via{" "}
                  <span className="text-slate-200">
                    {details.link.payoutMethod || selectedPayout}
                  </span>{" "}
                  is queued.
                </p>
              </div>
            ) : details.link.status === "claimed" ? (
              <div className="bg-emerald-500/10 border-emerald-500/25 rounded-2xl border p-5 text-center">
                <p className="text-emerald-300 font-semibold">
                  Already claimed
                </p>
                <p className="text-slate-400 mt-1 text-sm">
                  Payout method: {details.link.payoutMethod}
                </p>
              </div>
            ) : details.link.status === "expired" ? (
              <div className="bg-red-500/10 border-red-500/25 rounded-2xl border p-5 text-center">
                <p className="text-red-300 font-semibold">Link expired</p>
                <p className="text-slate-400 mt-1 text-sm">
                  This claim link is no longer valid. Ask the sender to re-issue
                  it.
                </p>
              </div>
            ) : (
              <>
                {/* Payout picker */}
                <p className="text-slate-300 mb-2.5 text-sm font-semibold">
                  Choose how to receive it
                </p>
                <div className="mb-5 space-y-2">
                  {details.payoutOptions.map((opt) => {
                    const Icon = payoutIcon(opt);
                    return (
                      <label
                        key={opt}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all duration-150 ${
                          selectedPayout === opt
                            ? "border-amber-400/60 bg-amber-400/10 shadow-glow-cyan"
                            : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12]"
                        }`}
                      >
                        <span className="text-slate-400">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="text-slate-300 flex-1 text-[13px] leading-snug">
                          {opt}
                        </span>
                        <input
                          type="radio"
                          name="payout"
                          value={opt}
                          checked={selectedPayout === opt}
                          onChange={() => setSelectedPayout(opt)}
                          className="accent-amber-400 h-4 w-4"
                        />
                      </label>
                    );
                  })}
                </div>

                <button
                  onClick={handleClaim}
                  disabled={!selectedPayout || claiming}
                  className="btn-primary !from-amber-500 !to-orange-500 w-full !bg-gradient-to-r"
                >
                  {claiming ? "Claiming…" : "Claim payment"}
                </button>
              </>
            )}

            <p className="text-slate-600 mt-4 text-center text-[11px] leading-relaxed">
              Mocked — in production this payout would settle via Wise, Stripe,
              or a local rail.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
