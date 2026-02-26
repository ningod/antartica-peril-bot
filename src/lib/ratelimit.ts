/**
 * Sliding-window rate limiter per user.
 *
 * Tracks timestamps of recent actions per user ID and rejects actions
 * that exceed the configured limit within the window.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly maxActions: number;
  private readonly windowMs: number;

  /**
   * @param maxActions - Max actions allowed per window (default 5).
   * @param windowMs   - Window duration in ms (default 10_000 = 10 s).
   */
  constructor(maxActions = 5, windowMs = 10_000) {
    this.maxActions = maxActions;
    this.windowMs = windowMs;
  }

  /**
   * Attempt to consume one action for the user.
   * Returns true if allowed; false if rate-limited.
   */
  consume(userId: string): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let timestamps = this.hits.get(userId);
    if (!timestamps) {
      timestamps = [];
      this.hits.set(userId, timestamps);
    }

    const filtered = timestamps.filter((t) => t > cutoff);

    if (filtered.length >= this.maxActions) {
      this.hits.set(userId, filtered);
      return false;
    }

    filtered.push(now);
    this.hits.set(userId, filtered);
    return true;
  }

  /** Seconds until the user can act again. Returns 0 if not rate-limited. */
  retryAfterSeconds(userId: string): number {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const timestamps = this.hits.get(userId);
    if (!timestamps) return 0;

    const filtered = timestamps.filter((t) => t > cutoff);
    if (filtered.length < this.maxActions) return 0;

    const oldest = filtered[0] ?? 0;
    const retryAt = oldest + this.windowMs;
    return Math.ceil((retryAt - now) / 1000);
  }
}
