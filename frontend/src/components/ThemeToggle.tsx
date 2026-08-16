import { useTheme } from "../lib/themeMode";
import { IconMoon, IconSun } from "./icons";

export function ThemeToggle() {
  const { theme, resolved, cycle } = useTheme();
  const label =
    theme === "system"
      ? `Theme: system (${resolved})`
      : theme === "dark"
        ? "Theme: dark"
        : "Theme: light";
  return (
    <button
      type="button"
      onClick={cycle}
      className="btn-ghost !px-2.5 !py-1.5"
      title={`${label} — click to change`}
      aria-label={label}
    >
      {resolved === "dark" ? (
        <IconMoon className="h-4 w-4" />
      ) : (
        <IconSun className="h-4 w-4" />
      )}
    </button>
  );
}
