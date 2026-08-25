const KEY = "litefx-db-v2";
const mem = new Map<string, string>();

function readLS(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeLS(data: string): void {
  try {
    localStorage.setItem(KEY, data);
  } catch {
    /* quota / private mode */
  }
}

function persist(data: string): void {
  mem.set(KEY, data);
  writeLS(data);
}

export function existsSync(p: string): boolean {
  if (p.endsWith("db.json") || p.includes(KEY)) {
    return mem.has(KEY) || readLS() != null;
  }
  return true;
}

export function mkdirSync(_p: string, _opts?: { recursive?: boolean }): void {
  /* no-op */
}

export function readFileSync(_p: string, _enc?: string): string {
  return mem.get(KEY) ?? readLS() ?? "";
}

export function writeFileSync(p: string, data: string | Uint8Array): void {
  persist(String(data));
  mem.set(p, String(data));
}

export function renameSync(from: string, _to: string): void {
  const data = mem.get(from);
  if (data != null) persist(data);
}
