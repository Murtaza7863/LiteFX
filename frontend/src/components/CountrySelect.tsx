import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { COUNTRIES } from "../lib/countries";
import { countryToCommit, filterCountries } from "../lib/countryQuery";
import { countryFlag } from "../lib/theme";

interface Props {
  value: string;
  onChange: (code: string) => void;
  className?: string;
}

export type CountrySelectHandle = {
  /** Apply the highlighted row. No-op if the picker is closed. */
  commit: () => string | null;
};

export const CountrySelect = forwardRef<CountrySelectHandle, Props>(
  function CountrySelect({ value, onChange, className = "" }, ref) {
    const selected = COUNTRIES.find((c) => c.code === value);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const root = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const queryRef = useRef(query);
    const matchesRef = useRef<typeof COUNTRIES>(COUNTRIES);
    const activeRef = useRef(0);
    const onChangeRef = useRef(onChange);
    const openRef = useRef(open);
    const valueRef = useRef(value);
    queryRef.current = query;
    activeRef.current = active;
    onChangeRef.current = onChange;
    openRef.current = open;
    valueRef.current = value;

    const matches = useMemo(() => filterCountries(query), [query]);
    matchesRef.current = matches;

    const pick = (code: string) => {
      onChange(code);
      setOpen(false);
      setQuery("");
    };

    const commitOpenQuery = () => {
      const q = queryRef.current.trim();
      if (!q && !valueRef.current) {
        setOpen(false);
        setQuery("");
        return null;
      }
      const code = countryToCommit(
        queryRef.current,
        matchesRef.current,
        activeRef.current,
      );
      if (code) onChangeRef.current(code);
      setOpen(false);
      setQuery("");
      return code;
    };

    useImperativeHandle(ref, () => ({
      commit: () => {
        if (!openRef.current) return valueRef.current;
        return commitOpenQuery();
      },
    }));
    useEffect(() => {
      if (!open) return;
      const onDoc = (e: MouseEvent) => {
        if (root.current && !root.current.contains(e.target as Node)) {
          commitOpenQuery();
        }
      };
      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
    }, [open]);

    useEffect(() => {
      if (!open) return;
      if (query.trim()) {
        setActive(0);
        return;
      }
      const idx = COUNTRIES.findIndex((c) => c.code === value);
      setActive(idx >= 0 ? idx : 0);
    }, [query, open, value]);

    useEffect(() => {
      if (!open) return;
      const el = listRef.current?.querySelector(
        "[data-active='true']",
      ) as HTMLElement | null;
      const list = listRef.current;
      if (!el || !list) return;
      const top = el.offsetTop;
      const bottom = top + el.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) {
        list.scrollTop = bottom - list.clientHeight;
      }
    }, [active, open, matches]);

    const display = selected
      ? `${countryFlag(selected.code)} ${selected.name}`
      : "Country";

    return (
      <div ref={root} className={`relative ${className}`}>
        <div className="relative">
          <input
            className="input-field pr-8"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-label="Country"
            autoComplete="off"
            spellCheck={false}
            value={open ? query : display}
            placeholder="Search country…"
            onFocus={() => {
              const idx = COUNTRIES.findIndex(
                (c) => c.code === valueRef.current,
              );
              setActive(idx >= 0 ? idx : 0);
              setOpen(true);
              setQuery("");
            }}
            onBlur={() => {
              requestAnimationFrame(() => {
                if (!root.current?.contains(document.activeElement)) {
                  commitOpenQuery();
                }
              });
            }}
            onChange={(e) => {
              setOpen(true);
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setActive((i) =>
                  Math.min(i + 1, Math.max(matches.length - 1, 0)),
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && open && matches[active]) {
                e.preventDefault();
                pick(matches[active].code);
              } else if (e.key === "Escape") {
                setOpen(false);
                setQuery("");
              }
            }}
          />
          <span className="text-slate-500 pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[10px]">
            ▾
          </span>
        </div>
        {open && (
          <ul
            ref={listRef}
            role="listbox"
            className="glass-strong absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-xl py-1"
          >
            {matches.length === 0 && (
              <li className="text-slate-500 px-3 py-2 text-sm">No matches</li>
            )}
            {matches.map((c, i) => (
              <li
                key={c.code}
                role="option"
                aria-selected={c.code === value}
                tabIndex={-1}
                data-active={i === active}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  i === active
                    ? "bg-[var(--text)]/8 text-[var(--text)]"
                    : "text-slate-200 hover:bg-white/[0.05]"
                }`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c.code);
                }}
              >
                <span className="mr-2">{countryFlag(c.code)}</span>
                {c.name}
                <span className="text-slate-500 ml-1.5 text-[11px]">
                  {c.code} · {c.currency}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);
