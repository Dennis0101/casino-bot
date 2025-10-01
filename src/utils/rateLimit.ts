const last = new Map<string, number>();
export function hit(key: string, ms: number) {
  const now = Date.now();
  const prev = last.get(key) ?? 0;
  if (now - prev < ms) return false;
  last.set(key, now);
  return true;
}
