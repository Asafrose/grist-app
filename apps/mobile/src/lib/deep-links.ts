const MAX_KEYS = 200;

const consumed = new Set<string>();

export const deepLinks = {
  consume(key: string): boolean {
    if (consumed.has(key)) return false;
    if (consumed.size >= MAX_KEYS) {
      const oldest = consumed.values().next().value;
      if (oldest !== undefined) consumed.delete(oldest);
    }
    consumed.add(key);
    return true;
  },
  reset() {
    consumed.clear();
  },
};

export function seekKey(routeKey: string, at: number): string {
  return `t:${routeKey}:${at}`;
}

export function clipKey(routeKey: string, clipId: string): string {
  return `clip:${routeKey}:${clipId}`;
}
