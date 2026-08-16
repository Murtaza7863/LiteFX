export function appBase(): string {
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

export function claimUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${appBase()}/claim/${token}`;
}
