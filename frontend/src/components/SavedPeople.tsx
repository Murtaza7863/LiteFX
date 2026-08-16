import type { Entity, SavedContact } from "../api/client";

import { countryFlag } from "../lib/theme";
import { Avatar } from "./Avatar";
import { IconX } from "./icons";

function onThisTrip(contact: SavedContact, entities: Entity[]): boolean {
  const name = contact.name.trim().toLowerCase();
  return entities.some(
    (e) =>
      e.contactId === contact.id ||
      (e.name.trim().toLowerCase() === name && e.country === contact.country),
  );
}

export function SavedPeople({
  contacts,
  entities,
  locked,
  onAdd,
  onRemove,
}: {
  contacts: SavedContact[];
  entities: Entity[];
  locked?: boolean;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (contacts.length === 0) return null;
  return (
    <div>
      <p className="text-slate-500 mb-1.5 text-[10px] font-medium tracking-wide uppercase">
        Saved people
      </p>
      <div className="flex flex-wrap gap-1.5">
        {contacts.map((c) => {
          const added = onThisTrip(c, entities);
          return (
            <span
              key={c.id}
              className={`inline-flex items-center gap-1 rounded-full border py-0.5 pr-0.5 pl-1 ${
                added
                  ? "bg-white/[0.04] border-[var(--border)] opacity-50"
                  : "bg-white/[0.06] border-[var(--border)]"
              }`}
            >
              <button
                type="button"
                disabled={locked || added}
                onClick={() => onAdd(c.id)}
                title={added ? "Already on this trip" : `Add ${c.name.trim()}`}
                className="flex items-center gap-1.5 py-0.5 pr-0.5 pl-0.5 disabled:cursor-default"
              >
                <Avatar id={c.id} name={c.name} size={20} />
                <span className="text-slate-200 max-w-[7rem] truncate text-[12px]">
                  {c.name.trim()}
                </span>
                <span className="text-slate-500 text-[11px]">
                  {countryFlag(c.country)}
                </span>
              </button>
              <button
                type="button"
                disabled={locked}
                aria-label={`Remove ${c.name.trim()} from saved people`}
                title="Remove from saved people"
                onClick={() => onRemove(c.id)}
                className="text-slate-600 flex h-6 w-6 items-center justify-center rounded-full hover:text-[#c48878] disabled:opacity-40"
              >
                <IconX className="h-3 w-3" />
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
