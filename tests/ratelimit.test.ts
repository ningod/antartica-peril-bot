import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateLimiter } from '../src/lib/ratelimit.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(3, 1000); // 3 actions per 1 second
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows actions within the limit', () => {
    expect(limiter.consume('user-1')).toBe(true);
    expect(limiter.consume('user-1')).toBe(true);
    expect(limiter.consume('user-1')).toBe(true);
  });

  it('blocks the 4th action when limit is 3', () => {
    limiter.consume('user-1');
    limiter.consume('user-1');
    limiter.consume('user-1');
    expect(limiter.consume('user-1')).toBe(false);
  });

  it('tracks different users independently', () => {
    limiter.consume('user-1');
    limiter.consume('user-1');
    limiter.consume('user-1');
    // user-1 is now blocked, user-2 should still be fine
    expect(limiter.consume('user-2')).toBe(true);
  });

  it('resets after the time window', () => {
    limiter.consume('user-1');
    limiter.consume('user-1');
    limiter.consume('user-1');
    expect(limiter.consume('user-1')).toBe(false);

    vi.advanceTimersByTime(1001); // past the 1s window

    expect(limiter.consume('user-1')).toBe(true);
  });

  it('retryAfterSeconds returns 0 when not rate-limited', () => {
    expect(limiter.retryAfterSeconds('user-1')).toBe(0);
  });

  it('retryAfterSeconds returns positive when rate-limited', () => {
    limiter.consume('user-1');
    limiter.consume('user-1');
    limiter.consume('user-1');
    // Now rate limited
    const seconds = limiter.retryAfterSeconds('user-1');
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(1);
  });

  it('retryAfterSeconds returns 0 for unknown user', () => {
    expect(limiter.retryAfterSeconds('unknown')).toBe(0);
  });
});
