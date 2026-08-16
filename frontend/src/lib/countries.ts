export {
  COUNTRIES,
  currencyOf as currencyFor,
  flagFromCode,
  railsFor,
  primaryRail,
} from "../../../backend/src/data/countries";
import { COUNTRIES } from "../../../backend/src/data/countries";

export const CURRENCY_OPTIONS = Array.from(
  new Set(COUNTRIES.map((c) => c.currency)),
).sort();

export const EXPENSE_CATEGORIES = [
  { id: "food", label: "Food" },
  { id: "accommodation", label: "Stay" },
  { id: "transport", label: "Transport" },
  { id: "activities", label: "Activities" },
  { id: "general", label: "General" },
] as const;

export const categoryLabel = (id: string): string =>
  EXPENSE_CATEGORIES.find((c) => c.id === id)?.label ?? "General";
