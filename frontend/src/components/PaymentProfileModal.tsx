import { useEffect, useRef, useState } from "react";

import type { User } from "../api/client";

import { client } from "../api/client";
import { alignRailsToCountry, primaryRail } from "../lib/countries";
import { CountrySelect, type CountrySelectHandle } from "./CountrySelect";
import { IconX } from "./icons";
import {
  methodsMissingAlias,
  PaymentMethodsEditor,
  type PaymentMethod,
} from "./PaymentMethodsEditor";

export function PaymentProfileModal({
  user,
  onClose,
  onSaved,
  onAddMe,
  onTrip,
}: {
  user: User;
  onClose: () => void;
  onSaved: (user: User, msg: string) => void;
  onAddMe?: () => void;
  onTrip: boolean;
}) {
  const [country, setCountry] = useState(user.country ?? "SG");
  const countryRef = useRef(user.country ?? "SG");
  const countrySelectRef = useRef<CountrySelectHandle>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>(
    user.linkedRailAliases?.length
      ? user.linkedRailAliases.map((a) => ({
          railType: a.railType,
          alias: a.alias,
        }))
      : [{ railType: primaryRail(user.country ?? "SG"), alias: "" }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const persist = async (): Promise<boolean> => {
    const committed = countrySelectRef.current?.commit();
    const code = committed || countryRef.current;
    const aligned = alignRailsToCountry(code, methods, true);
    const toSave =
      aligned.length > 0
        ? aligned
        : methods.length > 0
          ? [{ railType: primaryRail(code), alias: methods[0]?.alias ?? "" }]
          : [];
    const missing = methodsMissingAlias(toSave);
    if (missing) {
      setError(missing);
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await client.updateProfile({
        country: code,
        linkedRailAliases: toSave,
      });
      onSaved(
        r.user,
        toSave.length
          ? `Saved ${toSave.map((m) => m.railType).join(", ")} for ${code}`
          : `Saved country ${code}. Add a rail when you have an account.`,
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="animate-fade-in bg-black/60 fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="glass-strong animate-scale-in relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-profile-title"
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
        <h2
          id="payment-profile-title"
          className="font-display text-slate-100 pr-10 text-[1.35rem] font-semibold tracking-[-0.03em]"
        >
          Your payment methods
        </h2>
        <p className="text-slate-400 mt-1.5 text-[13px] leading-6">
          Pick the country you get paid in, then add the rails that actually
          exist there. Send slips will use these IDs.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void persist().then((ok) => {
              if (ok) onClose();
            });
          }}
        >
          <CountrySelect
            ref={countrySelectRef}
            value={country}
            onChange={(code) => {
              if (code === countryRef.current) return;
              const next = alignRailsToCountry(code, methods, true);
              countryRef.current = code;
              setCountry(code);
              setMethods(
                next.length ? next : [{ railType: primaryRail(code), alias: "" }],
              );
            }}
          />
          <PaymentMethodsEditor
            country={country}
            value={methods}
            onChange={setMethods}
            disabled={busy}
          />
          {error && <p className="text-xs text-[#c48878]">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="btn-primary flex-1">
              {busy ? "Saving…" : "Save methods"}
            </button>
            {onAddMe && (
              <button
                type="button"
                disabled={busy || onTrip || !country}
                title={
                  onTrip
                    ? "You are already on this trip"
                    : "Add yourself using these rails"
                }
                onClick={() => {
                  void persist().then((ok) => {
                    if (!ok) return;
                    onClose();
                    onAddMe();
                  });
                }}
                className="btn-ghost flex-1"
              >
                {onTrip ? "On this trip" : "Save and add me"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
