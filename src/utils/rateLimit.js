const last = new Map();
export function hit(key, ms) {
  const now = Date.now();
  const prev = last.get(key) || 0;
  if (now - prev < ms) return false;
  last.set(key, now);
  return true;
}
