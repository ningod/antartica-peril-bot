/**
 * Storage interfaces and session/pool data types for Antartica Peril Bot.
 */

import type { Label, DrawnLabel, LabelType } from './domain.js';
import type { Lang } from './i18n/index.js';

export type { Label, DrawnLabel, LabelType };

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/** Channel-scoped threat pool (Minacce/Visioni) used as bag seeds. */
export interface ThreatPool {
  channelId: string;
  labels: Label[];
  updatedAt: Date;
}

/** Channel-scoped Pericolo session state. */
export interface PericoloSession {
  sessionId: string;
  channelId: string;
  guildId: string;
  /** Discord user ID of the Guide (authorised to draw/end/reset). */
  guideId: string;
  /** Display name of the Guide (stored at session start for embed display). */
  guideName: string;
  objective: string;
  notes?: string;
  /** Remaining labels in the bag (after draws). */
  bag: Label[];
  /** All labels ever inserted (for bag display). */
  allLabels: Label[];
  /** Base extraction (3 draws). */
  baseDraws: DrawnLabel[];
  /** Push Yourself extra draws (1–2). */
  pushDraws: DrawnLabel[];
  /** Prevents the threat pool from being added twice. */
  threatPoolAdded: boolean;
  /** Prevents Explorer conditions from being added more than once. */
  conditionsAdded: boolean;
  /** Prevents Explorer resignations from being added more than once. */
  resignationsAdded: boolean;
  /**
   * Label waiting for the user's duplicate-warning confirmation.
   * Set by /peril add when a similar label is found; cleared on confirm or cancel.
   */
  pendingLabel?: Label;
  /** User ID who triggered the pending label confirmation. */
  pendingAddUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A single tag in an Explorer character profile. */
export interface ExplorerTag {
  id: string;
  type: LabelType;
  /** Text content; empty string for rassegnazione. */
  text: string;
  /** Positive side for tratto-segnato. */
  posSide?: string;
  /** Negative side for tratto-segnato. */
  negSide?: string;
}

/** Per-user per-channel Explorer character profile. Persists until cleared. */
export interface ExplorerProfile {
  userId: string;
  channelId: string;
  tags: ExplorerTag[];
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

/**
 * Async storage interface for all Pericolo bot state.
 *
 * Implementations: MemoryPericoloStore (default), RedisPericoloStore (optional).
 */
export interface IPericoloStore {
  /** Start background maintenance (TTL sweep). */
  start(): void;

  /** Stop background maintenance. */
  stop(): void;

  // -- Threat pool (channel-scoped) --

  /** Get the current threat pool for a channel. Returns null if not set. */
  getThreatPool(channelId: string): Promise<ThreatPool | null>;

  /** Persist a threat pool (overwrites existing). */
  setThreatPool(pool: ThreatPool): Promise<void>;

  /** Remove the threat pool for a channel. */
  clearThreatPool(channelId: string): Promise<void>;

  // -- Session (channel-scoped) --

  /** Get the active session for a channel. Returns null if absent or expired. */
  getSession(channelId: string): Promise<PericoloSession | null>;

  /** Persist a session (creates or updates). */
  setSession(session: PericoloSession): Promise<void>;

  /** Delete a session. Returns true if it existed. */
  deleteSession(channelId: string): Promise<boolean>;

  // -- Channel language (channel-scoped) --

  /** Get the configured language for a channel. Returns DEFAULT_LANG if not set. */
  getChannelLang(channelId: string): Promise<Lang>;

  /** Persist the language preference for a channel. */
  setChannelLang(channelId: string, lang: Lang): Promise<void>;

  // -- Explorer profile (user+channel-scoped) --

  /** Get the Explorer profile for a user in a channel. Returns null if not set. */
  getExplorerProfile(userId: string, channelId: string): Promise<ExplorerProfile | null>;

  /** Persist an Explorer profile (creates or updates). */
  setExplorerProfile(profile: ExplorerProfile): Promise<void>;

  /** Remove the Explorer profile for a user in a channel. */
  clearExplorerProfile(userId: string, channelId: string): Promise<void>;

  /** Get all Explorer profiles for a channel (used by add-conditions). */
  getExplorerProfilesForChannel(channelId: string): Promise<ExplorerProfile[]>;
}
