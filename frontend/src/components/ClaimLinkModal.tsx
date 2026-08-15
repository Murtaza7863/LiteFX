import { useEffect, useState } from "react";
import type { ClaimDetails } from "../api/client";
import { client } from "../api/client";

// ──────────────────────────────────────────────
// Claim-link recipient view (modal).
//
// Simulates what a recipient would see when they open
// the claim link: shows the amount, lets them pick a
// payout method, and flips status to "claimed".
// No account creation step.
// ──────────────────────────────────────────────

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-amber-700/50 bg-slate-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-500 hover:text-slate-300 text-xl"
        >
          ✕
        </button>

        {loading && <p className="text-slate-400 py-8 text-center">Loading claim link…</p>}

        {error && (
          <div className="rounded-lg bg-red-950 border border-red-700 p-3 mb-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {details && !loading && (
          <>
            {/* Recipient view header */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="rounded bg-amber-950 border border-amber-600 px-2 py-0.5 text-xs font-semibold text-amber-400">
                  Claim Link
                </span>
                <span className={`rounded px-2 py-0.5 text-xs ${details.link.status === "pending" ? "bg-slate-700 text-slate-300" : details.link.status === "claimed" ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-300"}`}>
                  {details.link.status}
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-100">
                You've received money!
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Hi {details.recipient.name.trim()}, someone is sending you a settlement.
                Choose how you'd like to receive it — no account signup needed.
              </p>
            </div>

            {/* Amount */}
            <div className="mb-4 rounded-xl bg-slate-950 p-4 text-center">
              <p className="text-sm text-slate-500">Amount due to you</p>
              <p className="text-3xl font-bold text-amber-400">
                {details.obligation.amount.toLocaleString()} {details.obligation.settlementCurrency}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                ({details.obligation.amountUsd.toFixed(2)} USD)
              </p>
            </div>

            {/* Expiry notice */}
            <div className="mb-4 text-xs text-slate-500">
              Expires: {new Date(details.link.expiresAt).toLocaleString()}
            </div>

            {claimed ? (
              <div className="rounded-xl bg-emerald-950 border border-emerald-700 p-4 text-center">
                <p className="text-2xl mb-2">✓</p>
                <p className="font-semibold text-emerald-300">Claim successful!</p>
                <p className="text-sm text-slate-400 mt-1">
                  Payout via "{details.link.payoutMethod}" queued (mocked).
                  You'll receive a confirmation when the transfer completes.
                </p>
              </div>
            ) : details.link.status === "claimed" ? (
              <div className="rounded-xl bg-emerald-950 border border-emerald-700 p-4 text-center">
                <p className="font-semibold text-emerald-300">Already claimed</p>
                <p className="text-sm text-slate-400 mt-1">
                  Payout method: {details.link.payoutMethod}
                </p>
              </div>
            ) : (
              <>
                {/* Payout method selection */}
                <div className="mb-4">
                  <p className="text-sm font-medium text-slate-300 mb-2">
                    Choose a payout method:
                  </p>
                  <div className="space-y-2">
                    {details.payoutOptions.map((opt) => (
                      <label
                        key={opt}
                        className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          selectedPayout === opt
                            ? "border-amber-500 bg-amber-950/50"
                            : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name="payout"
                          value={opt}
                          checked={selectedPayout === opt}
                          onChange={() => setSelectedPayout(opt)}
                          className="accent-amber-500"
                        />
                        <span className="text-sm text-slate-300">{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleClaim}
                  disabled={!selectedPayout || claiming}
                  className="w-full rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 font-semibold text-white transition-colors"
                >
                  {claiming ? "Claiming…" : "Claim & Choose Payout"}
                </button>
              </>
            )}

            <p className="mt-4 text-xs text-slate-600 text-center">
              MOCKED — In production, the chosen payout method would trigger
              a real transfer via Wise, Stripe, or a local rail.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
