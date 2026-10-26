/**
 * 簡易レート制限（プロセス内メモリ）。API キー利用料の濫用を抑える最低限の保護。
 * 複数インスタンス構成では共有されない点に注意（本番では Redis 等へ置き換える）。
 */
export function createRateLimiter(maxRequests: number, windowMs = 60_000) {
  const hits = new Map<string, number[]>();
  return function isLimited(key: string): boolean {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= maxRequests) {
      hits.set(key, recent);
      return true;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    }
    return false;
  };
}

export function clientKey(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}
