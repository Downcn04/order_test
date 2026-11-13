const lastHit = new Map<string, number>();

export function allowOnce(key: string, windowMs: number): boolean {
  const now = Date.now();
  const previous = lastHit.get(key) ?? 0;
  if (now - previous < windowMs) return false;
  lastHit.set(key, now);
  return true;
}
