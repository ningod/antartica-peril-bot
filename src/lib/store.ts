/**
 * In-memory implementation of IPericoloStore.
 *
 * Sessions auto-expire after the configured TTL (default 6 hours).
 * A periodic sweep removes stale entries every 10 minutes.
 * Threat pools and Explorer profiles never expire.
 */

import type {
  IPericoloStore,
  PericoloSession,
  ThreatPool,
  ExplorerProfile,
} from './store-interface.js';
import type { Lang } from './i18n/index.js';
import { DEFAULT_LANG } from './i18n/index.js';

/** Default session TTL: 6 hours in milliseconds. */
const DEFAULT_SESSION_TTL_MS = 6 * 60 * 60 * 1000;

/** Interval between cleanup sweeps: 10 minutes. */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

export class MemoryPericoloStore implements IPericoloStore {
  private readonly threatPools = new Map<string, ThreatPool>();
  private readonly sessions = new Map<string, PericoloSession>();
  private readonly channelLangs = new Map<string, Lang>();
  private readonly explorerProfiles = new Map<string, ExplorerProfile>();
  private readonly sessionTtlMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(sessionTtlMs: number = DEFAULT_SESSION_TTL_MS) {
    this.sessionTtlMs = sessionTtlMs;
  }

  /** Start the periodic cleanup timer. Call once at bot startup. */
  start(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.sweep();
    }, CLEANUP_INTERVAL_MS);
    // Allow the process to exit even with the timer running.
    this.cleanupTimer.unref();
  }

  /** Stop the periodic cleanup timer. */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // -- Threat pool --

  async getThreatPool(channelId: string): Promise<ThreatPool | null> {
    return this.threatPools.get(channelId) ?? null;
  }

  async setThreatPool(pool: ThreatPool): Promise<void> {
    this.threatPools.set(pool.channelId, pool);
  }

  async clearThreatPool(channelId: string): Promise<void> {
    this.threatPools.delete(channelId);
  }

  // -- Session --

  async getSession(channelId: string): Promise<PericoloSession | null> {
    const session = this.sessions.get(channelId);
    if (!session) return null;

    if (this.isExpired(session)) {
      this.sessions.delete(channelId);
      return null;
    }

    return session;
  }

  async setSession(session: PericoloSession): Promise<void> {
    this.sessions.set(session.channelId, session);
  }

  async deleteSession(channelId: string): Promise<boolean> {
    return this.sessions.delete(channelId);
  }

  // -- Channel language --

  async getChannelLang(channelId: string): Promise<Lang> {
    return this.channelLangs.get(channelId) ?? DEFAULT_LANG;
  }

  async setChannelLang(channelId: string, lang: Lang): Promise<void> {
    this.channelLangs.set(channelId, lang);
  }

  // -- Explorer profiles --

  async getExplorerProfile(userId: string, channelId: string): Promise<ExplorerProfile | null> {
    return this.explorerProfiles.get(this.explorerKey(userId, channelId)) ?? null;
  }

  async setExplorerProfile(profile: ExplorerProfile): Promise<void> {
    this.explorerProfiles.set(this.explorerKey(profile.userId, profile.channelId), profile);
  }

  async clearExplorerProfile(userId: string, channelId: string): Promise<void> {
    this.explorerProfiles.delete(this.explorerKey(userId, channelId));
  }

  async getExplorerProfilesForChannel(channelId: string): Promise<ExplorerProfile[]> {
    const results: ExplorerProfile[] = [];
    for (const profile of this.explorerProfiles.values()) {
      if (profile.channelId === channelId) {
        results.push(profile);
      }
    }
    return results;
  }

  /** Current session count (may include not-yet-swept expired entries). */
  get sessionCount(): number {
    return this.sessions.size;
  }

  // -- Internal --

  private explorerKey(userId: string, channelId: string): string {
    return `${userId}:${channelId}`;
  }

  private isExpired(session: PericoloSession): boolean {
    return Date.now() - session.createdAt.getTime() > this.sessionTtlMs;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [channelId, session] of this.sessions) {
      if (now - session.createdAt.getTime() > this.sessionTtlMs) {
        this.sessions.delete(channelId);
      }
    }
  }
}
