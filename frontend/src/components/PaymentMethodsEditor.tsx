import { railsFor, aliasHint, primaryRail, countryByCode } from "../lib/countries";
import { IconPlus, IconX } from "./icons";

export type PaymentMethod = { railType: string; alias: string };

export function methodsMissingAlias(
  methods: PaymentMethod[],
): string | null {
  const blank = methods.find((m) => m.railType && !m.alias.trim());
  if (!blank) return null;
  return `Enter a ${blank.railType} ID so send slips can address the payout.`;
}

export function PaymentMethodsEditor({
  country,
  value,
  onChange,
  disabled = false,
}: {
  country: string;
  value: PaymentMethod[];
  onChange: (next: PaymentMethod[]) => void;
  disabled?: boolean;
}) {
  if (!countryByCode(country)) {
    return (
      <div className="space-y-2 sm:col-span-2">
        <p className="text-slate-500 text-[12px]">
          Pick a country to see the rails that exist there.
        </p>
      </div>
    );
  }

  const rails = railsFor(country);
  const used = new Set(value.map((m) => m.railType));
  const unused = rails.filter((r) => !used.has(r));

  const setAt = (i: number, patch: Partial<PaymentMethod>) => {
    onChange(value.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  };

  const add = (rail = unused[0] ?? primaryRail(country)) => {
    if (!rail || used.has(rail)) return;
    onChange([...value, { railType: rail, alias: "" }]);
  };

  return (
    <div className="space-y-2 sm:col-span-2">
      <p className="text-slate-500 text-[11px] font-medium tracking-wide uppercase">
        Payment methods in {country}
      </p>
      {value.length === 0 && (
        <p className="text-slate-500 text-[12px]">
          No linked rails. They will receive a claim link instead of a domestic
          payout.
        </p>
      )}
      {value.map((m, i) => (
        <div key={`${m.railType}-${i}`} className="flex gap-2">
          <select
            className="input-field !w-[42%] shrink-0"
            value={m.railType}
            disabled={disabled}
            onChange={(e) => setAt(i, { railType: e.target.value })}
          >
            {rails
              .filter((r) => r === m.railType || !used.has(r))
              .map((r) => (
                <option key={r} value={r} className="bg-slate-900">
                  {r}
                </option>
              ))}
          </select>
          <input
            className="input-field min-w-0 flex-1"
            placeholder={aliasHint(m.railType)}
            value={m.alias}
            disabled={disabled}
            maxLength={80}
            onChange={(e) => setAt(i, { alias: e.target.value })}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            className="btn-ghost !px-2"
            title={`Remove ${m.railType}`}
          >
            <IconX className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {unused.length > 0 && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => add()}
          className="btn-ghost !px-3 !py-1.5 text-xs"
        >
          <IconPlus className="h-3.5 w-3.5" />
          Add {unused[0]}
        </button>
      )}
    </div>
  );
}
