import { useEffect, useRef, useState } from "react";

import type { ClaimDetails } from "../api/client";

import { client, isStaticEngine } from "../api/client";
import { COUNTRY_NAMES } from "../lib/theme";
import { claimUrl } from "../lib/urls";
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

  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
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
    return () => previous?.focus();
  }, [token]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleClaim = () => {
    if (!selectedPayout) return;
    setClaiming(true);
    setError(null);
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
      className="animate-fade-in bg-black/60 fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="glass-strong animate-scale-in relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-title"
      >
        <button
          ref={closeRef}
          type="button"
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
          <div className="mt-2 mb-4 rounded-xl border border-[#c48878]/25 bg-[#c48878]/10 p-3">
            <p className="text-sm text-[#c48878]">{error}</p>
          </div>
        )}

        {details && details.recipient && details.obligation && !loading && (
          <>
            {/* Header */}
            <div className="mt-2 mb-5">
              <div className="mb-2 flex items-center gap-2">
                <span className="chip border border-[#c4a574]/30 bg-[#c4a574]/10 text-[#c4a574]">
                  <IconTicket className="h-3.5 w-3.5" />{" "}
                  {isStaticEngine ? "Recipient preview" : "Claim link"}
                </span>
                <span
                  className={`chip border ${
                    details.link.status === "pending"
                      ? "bg-slate-500/15 text-slate-400 border-slate-500/20"
                      : details.link.status === "claimed"
                        ? "border-[#9aaa8c]/25 bg-[#9aaa8c]/15 text-[#9aaa8c]"
                        : "border-[#c48878]/25 bg-[#c48878]/15 text-[#c48878]"
                  }`}
                >
                  {details.link.status}
                </span>
              </div>
              <h2
                id="claim-title"
                className="text-slate-50 text-2xl font-bold tracking-tight"
              >
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
                  {details.sender ? (
                    <>
                      . From {details.sender.name.trim()} in{" "}
                      {COUNTRY_NAMES[details.sender.country] ??
                        details.sender.country}
                      . Pick a{" "}
                      {COUNTRY_NAMES[details.recipient.country] ??
                        details.recipient.country}{" "}
                      payout. The sender does not pay on this rail.
                    </>
                  ) : (
                    <>
                      , a travel settlement is waiting for you. No signup
                      needed.
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Amount */}
            <div className="bg-black/30 border-white/[0.05] mb-5 rounded-2xl border p-5 text-center">
              <p className="text-slate-500 section-title mb-1">
                Amount due to you
              </p>
              <p className="brand-text font-display tnum text-[2.6rem] leading-none font-semibold tracking-[-0.03em]">
                {details.obligation.amount.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
                <span className="ml-2 font-sans text-lg font-medium tracking-normal text-[var(--muted)]">
                  {details.obligation.settlementCurrency}
                </span>
              </p>
              <p className="text-slate-500 mt-1 font-mono text-xs">
                ≈ ${details.obligation.amountUsd.toFixed(2)} USD · expires{" "}
                {new Date(details.link.expiresAt).toLocaleDateString()}
              </p>
            </div>

            {isStaticEngine ? (
              <p className="text-slate-500 mb-4 rounded-lg border border-[var(--border)] px-3 py-2 text-[11px] leading-relaxed">
                Browser demo: this previews the recipient experience on this
                device. Deploy the server version for cross-device claim links.
              </p>
            ) : (
              <>
                <div className="bg-white/[0.03] border-white/[0.05] mb-3 flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span className="text-slate-500 truncate font-mono text-[11px]">
                    {claimUrl(token)}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const url = claimUrl(token);
                        void navigator.clipboard.writeText(url).then(
                          () => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1600);
                          },
                          () => setCopied(false),
                        );
                      }}
                      className="text-slate-400 hover:text-slate-200 text-[11px] font-medium"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <a
                      href={claimUrl(token)}
                      target="_blank"
                      rel="noreferrer"
                      className="link-plain text-[11px] font-medium whitespace-nowrap"
                    >
                      Open ↗
                    </a>
                  </div>
                </div>
                {details.link.status !== "claimed" &&
                  details.link.status !== "expired" &&
                  !claimed && <ClaimSendRow details={details} token={token} />}
              </>
            )}

            {claimed ? (
              <div className="animate-scale-in rounded-xl border border-[var(--border)] p-5 text-center">
                <IconCheckCircle className="mx-auto mb-2 h-8 w-8 text-[#9aaa8c]" />
                <p className="text-lg font-semibold text-[#9aaa8c]">Claimed!</p>
                <p className="text-slate-400 mt-1 text-sm">
                  Payout via{" "}
                  <span className="text-slate-200">
                    {details.link.payoutMethod || selectedPayout}
                  </span>{" "}
                  is queued.
                </p>
              </div>
            ) : details.link.status === "claimed" ? (
              <div className="rounded-xl border border-[var(--border)] p-5 text-center">
                <p className="font-semibold text-[#9aaa8c]">Already claimed</p>
                <p className="text-slate-400 mt-1 text-sm">
                  Payout method: {details.link.payoutMethod}
                </p>
              </div>
            ) : details.link.status === "expired" ? (
              <div className="rounded-xl border border-[#c48878]/25 bg-[#c48878]/10 p-5 text-center">
                <p className="font-semibold text-[#c48878]">Link expired</p>
                <p className="text-slate-400 mt-1 text-sm">
                  This claim link is no longer valid. Ask the sender to re-issue
                  it.
                </p>
              </div>
            ) : (
              <>
                {/* Payout picker */}
                <p className="text-slate-300 mb-2.5 text-sm font-semibold">
                  Choose a{" "}
                  {COUNTRY_NAMES[details.recipient.country] ??
                    details.recipient.country}{" "}
                  payout
                </p>
                <div className="mb-5 space-y-2">
                  {details.payoutOptions.map((opt) => {
                    const Icon = payoutIcon(opt);
                    return (
                      <label
                        key={opt}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all duration-150 ${
                          selectedPayout === opt
                            ? "border-[var(--text)]/35 bg-[var(--text)]/5"
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
                          className="h-4 w-4"
                        />
                      </label>
                    );
                  })}
                </div>

                <button
                  onClick={handleClaim}
                  disabled={!selectedPayout || claiming}
                  className="btn-primary w-full"
                >
                  {claiming ? "Claiming…" : "Claim payment"}
                </button>
              </>
            )}

            <p className="text-slate-600 mt-4 text-center text-[11px] leading-relaxed">
              Simulated. In a live product this payout would settle via Wise,
              Stripe, or a local rail.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ClaimSendRow({
  details,
  token,
}: {
  details: ClaimDetails;
  token: string;
}) {
  const url = claimUrl(token);
  const amount = `${details.obligation.amount.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} ${details.obligation.settlementCurrency}`;
  const name = details.recipient.name.trim().split(" ")[0];
  const body = `Hi ${name}, you have ${amount} waiting on LiteFX. Claim it here (no account needed): ${url}`;
  const encoded = encodeURIComponent(body);
  const subject = encodeURIComponent(`LiteFX payout · ${amount}`);
  const contact = details.recipient.contact;
  const emailTo =
    contact.type === "email" && contact.value.includes("@")
      ? contact.value
      : "";
  const phoneDigits = (contact.value || "").replace(/\D/g, "");

  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {emailTo && (
        <a
          href={`mailto:${emailTo}?subject=${subject}&body=${encoded}`}
          className="chip bg-white/[0.04] border-white/[0.08] text-slate-300 hover:text-slate-100 border"
        >
          Email
        </a>
      )}
      {phoneDigits && (
        <>
          <a
            href={`sms:+${phoneDigits}?&body=${encoded}`}
            className="chip bg-white/[0.04] border-white/[0.08] text-slate-300 hover:text-slate-100 border"
          >
            SMS
          </a>
          <a
            href={`https://wa.me/${phoneDigits}?text=${encoded}`}
            target="_blank"
            rel="noreferrer"
            className="chip bg-white/[0.04] border-white/[0.08] text-slate-300 hover:text-slate-100 border"
          >
            WhatsApp
          </a>
        </>
      )}
      {!emailTo && !phoneDigits && (
        <span className="text-slate-500 text-[11px]">
          Add a valid email or phone number to share this link.
        </span>
      )}
    </div>
  );
}
