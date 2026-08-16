export function join(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\/{2,}/g, "/");
}

export function dirname(p: string): string {
  const norm = p.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  return i <= 0 ? "." : norm.slice(0, i);
}

export function resolve(...parts: string[]): string {
  return join(...parts);
}

export default { join, dirname, resolve };
