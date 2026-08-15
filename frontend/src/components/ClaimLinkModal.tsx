import { useEffect, useState } from "react";
import type { ComponentType } from "react";
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
import { COUNTRY_FLAGS } from "../lib/theme";

// ──────────────────────────────────────────────
// Claim-link recipient view (modal). Simulates what
// a recipient sees when they open the link: the amount,
// a payout-method picker, and a one-tap claim. No
// account creation required.
// ──────────────────────────────────────────────

const PAYOUT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "Local bank transfer (provide IBAN / account no.)": IconLandmark,
  "E-wallet (GrabPay, TrueMoney, Alipay, etc.)": IconSmartphone,
  "Cash pickup at Western Union / MoneyGram agent": IconBanknote,
  "Donate to charity": IconHeart,
};

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl glass-strong shadow-glass p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient accent bar */}
        <div className="absolute inset-x-0 top-0 h-1 rounded-t-3xl bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400" />

        <button
          onClick={onClose}
          className="absolute right-4 top-4 h-8 w-8 flex items-center justify-center rounded-full text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
          aria-label="Close"
        >
          <IconX className="h-4 w-4" />
        </button>

        {loading && (
          <div className="py-12 text-center text-slate-400 text-sm">Loading claim link…</div>
        )}

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/25 p-3 mb-4 mt-2">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {details && !loading && (
          <>
            {/* Header */}
            <div className="mb-5 mt-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="chip bg-amber-500/15 border border-amber-500/30 text-amber-300"><IconTicket className="h-3.5 w-3.5" /> Claim Link</span>
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
              <h2 className="text-2xl font-bold text-slate-50 tracking-tight">You've been paid</h2>
              <div className="flex items-center gap-2 mt-2">
                <Avatar id={details.recipient.id} name={details.recipient.name} size={28} />
                <p className="text-sm text-slate-400">
                  Hi <span className="text-slate-200 font-medium">{details.recipient.name.trim()}</span>, a travel
                  settlement is waiting for you. No signup needed.
                </p>
              </div>
            </div>

            {/* Amount */}
            <div className="mb-5 rounded-2xl bg-black/30 border border-white/[0.05] p-5 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Amount due to you</p>
              <p className="text-4xl font-bold brand-text font-mono tracking-tight">
                {details.obligation.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                <span className="text-xl ml-1.5">{details.obligation.settlementCurrency}</span>
              </p>
              <p className="text-xs text-slate-500 mt-1 font-mono">
                ≈ ${details.obligation.amountUsd.toFixed(2)} USD · expires{" "}
                {new Date(details.link.expiresAt).toLocaleDateString()}
              </p>
            </div>

            {/* Real, shareable claim URL */}
            <div className="mb-5 flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2">
              <span className="text-[11px] text-slate-500 font-mono truncate">/claim/{token.slice(0, 12)}…</span>
              <a
                href={`/claim/${token}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-medium text-cyan-400 hover:underline whitespace-nowrap"
              >
                Open shareable link ↗
              </a>
            </div>

            {claimed ? (
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-5 text-center animate-scale-in">
                <IconCheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-300" />
                <p className="font-semibold text-emerald-300 text-lg">Claimed!</p>
                <p className="text-sm text-slate-400 mt-1">
                  Payout via{" "}
                  <span className="text-slate-200">{details.link.payoutMethod || selectedPayout}</span> is queued.
                </p>
              </div>
            ) : details.link.status === "claimed" ? (
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-5 text-center">
                <p className="font-semibold text-emerald-300">Already claimed</p>
                <p className="text-sm text-slate-400 mt-1">Payout method: {details.link.payoutMethod}</p>
              </div>
            ) : details.link.status === "expired" ? (
              <div className="rounded-2xl bg-red-500/10 border border-red-500/25 p-5 text-center">
                <p className="font-semibold text-red-300">Link expired</p>
                <p className="text-sm text-slate-400 mt-1">This claim link is no longer valid. Ask the sender to re-issue it.</p>
              </div>
            ) : (
              <>
                {/* Payout picker */}
                <p className="text-sm font-semibold text-slate-300 mb-2.5">Choose how to receive it</p>
                <div className="space-y-2 mb-5">
                  {details.payoutOptions.map((opt) => {
                    const Icon = PAYOUT_ICONS[opt] ?? IconBanknote;
                    return (
                      <label
                        key={opt}
                        className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all duration-150 ${
                          selectedPayout === opt
                            ? "border-amber-400/60 bg-amber-400/10 shadow-glow-cyan"
                            : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12]"
                        }`}
                      >
                        <span className="text-slate-400"><Icon className="h-5 w-5" /></span>
                        <span className="flex-1 text-[13px] text-slate-300 leading-snug">{opt}</span>
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
                  className="btn-primary w-full !bg-gradient-to-r !from-amber-500 !to-orange-500"
                >
                  {claiming ? "Claiming…" : "Claim payment"}
                </button>
              </>
            )}

            <p className="mt-4 text-[11px] text-slate-600 text-center leading-relaxed">
              Mocked — in production this payout would settle via Wise, Stripe, or a local rail.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
