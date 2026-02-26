/**
 * Core domain logic for Antartica — Peril Bot.
 *
 * Implements the label system, extraction (bag draw), polarity resolution,
 * and Tratto-Segnato deferred-resolution mechanic for the "Brave the Peril" procedure.
 */
import { randomInt, randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Label type system
// ---------------------------------------------------------------------------

export type LabelType =
  | 'tratto'
  | 'tratto-nome'
  | 'tratto-archetipo'
  | 'risorsa'
  | 'tratto-segnato'
  | 'condizione'
  | 'terrore'
  | 'rassegnazione'
  | 'minaccia'
  | 'visione';

export const LABEL_TYPES: readonly LabelType[] = [
  'tratto',
  'tratto-nome',
  'tratto-archetipo',
  'risorsa',
  'tratto-segnato',
  'condizione',
  'terrore',
  'rassegnazione',
  'minaccia',
  'visione',
] as const;

export const LABEL_TYPE_DISPLAY: Record<LabelType, string> = {
  tratto: 'Tratto',
  'tratto-nome': 'Nome',
  'tratto-archetipo': 'Archetipo',
  risorsa: 'Risorsa',
  'tratto-segnato': 'Tratto-Segnato',
  condizione: 'Condizione',
  terrore: 'Terrore',
  rassegnazione: 'Rassegnazione',
  minaccia: 'Minaccia',
  visione: 'Visione',
};

/** Types that always resolve as positive. */
const ALWAYS_POSITIVE: ReadonlySet<LabelType> = new Set<LabelType>([
  'tratto',
  'tratto-nome',
  'tratto-archetipo',
  'risorsa',
]);

/** Types that trigger Severe Consequences when drawn during Push Yourself. */
export const THREAT_VISION_TYPES: ReadonlySet<LabelType> = new Set<LabelType>([
  'minaccia',
  'visione',
]);

/** Maximum allowed length for a label text field. */
export const MAX_LABEL_TEXT_LENGTH = 200;

/** Maximum allowed length for objective / notes. */
export const MAX_NARRATIVE_TEXT_LENGTH = 500;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export interface Label {
  id: string;
  type: LabelType;
  /** Text is optional: rassegnazione carries no text. */
  text?: string;
  ownerId?: string;
  /** Positive-side display text for tratto-segnato. */
  posSide?: string;
  /** Negative-side display text for tratto-segnato. */
  negSide?: string;
}

export interface DrawnLabel {
  label: Label;
  /** 'uncertain' for tratto-segnato — resolved to positive/negative only at session end. */
  polarity: 'positive' | 'negative' | 'uncertain';
  /** Resolved display text (positive side for uncertain tratto-segnato). */
  displayText: string;
  /** True for minaccia and visione — triggers Severe Consequences in Push Yourself. */
  isThreatOrVision: boolean;
}

export interface DrawSummary {
  draws: DrawnLabel[];
  positiveCount: number;
  negativeCount: number;
  uncertainCount: number;
}

/** Result of resolving a single uncertain (tratto-segnato) draw at session end. */
export interface UncertainFlip {
  label: Label;
  polarity: 'positive' | 'negative';
  displayText: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a new Label with a crypto-random UUID. */
export function createLabel(
  type: LabelType,
  text = '',
  ownerId?: string,
  posSide?: string,
  negSide?: string
): Label {
  return {
    id: randomUUID(),
    type,
    text: text || undefined,
    ownerId,
    posSide,
    negSide,
  };
}

// ---------------------------------------------------------------------------
// Polarity resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the polarity and display text for a drawn label.
 *
 * - tratto / tratto-nome / tratto-archetipo / risorsa → always positive
 * - minaccia / visione / condizione / terrore / rassegnazione → always negative
 * - tratto-segnato → 'uncertain'; coin flip deferred to resolveUncertainDraws at session end
 */
export function resolveLabel(label: Label): DrawnLabel {
  if (ALWAYS_POSITIVE.has(label.type)) {
    return {
      label,
      polarity: 'positive',
      displayText: label.text ?? '',
      isThreatOrVision: false,
    };
  }

  if (label.type === 'tratto-segnato') {
    return {
      label,
      polarity: 'uncertain',
      displayText: label.posSide ?? label.text ?? '',
      isThreatOrVision: false,
    };
  }

  // All remaining types are negative
  return {
    label,
    polarity: 'negative',
    displayText: label.text ?? '',
    isThreatOrVision: THREAT_VISION_TYPES.has(label.type),
  };
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Draw `count` labels from the bag without replacement.
 * Uses crypto.randomInt for secure random selection.
 */
export function drawFromBag(
  bag: Label[],
  count: number
): { drawn: DrawnLabel[]; remaining: Label[] } {
  if (bag.length === 0 || count <= 0) {
    return { drawn: [], remaining: [...bag] };
  }

  const actualCount = Math.min(count, bag.length);
  const remaining = [...bag];
  const drawn: DrawnLabel[] = [];

  for (let i = 0; i < actualCount; i++) {
    const idx = randomInt(0, remaining.length);
    // splice always returns an element here since idx < remaining.length
    const label = remaining.splice(idx, 1)[0];
    drawn.push(resolveLabel(label));
  }

  return { drawn, remaining };
}

/** Count positive, negative, and uncertain draws. */
export function summarizeDraws(draws: DrawnLabel[]): DrawSummary {
  let positiveCount = 0;
  let negativeCount = 0;
  let uncertainCount = 0;
  for (const d of draws) {
    if (d.polarity === 'positive') {
      positiveCount++;
    } else if (d.polarity === 'negative') {
      negativeCount++;
    } else {
      uncertainCount++;
    }
  }
  return { draws, positiveCount, negativeCount, uncertainCount };
}

/**
 * Resolve all uncertain (tratto-segnato) draws via coin flip.
 * Called only at session end (/pericolo end or Fine Pericolo button).
 * Non-uncertain draws pass through unchanged.
 */
export function resolveUncertainDraws(draws: DrawnLabel[]): {
  resolved: DrawnLabel[];
  flips: UncertainFlip[];
} {
  const resolved: DrawnLabel[] = [];
  const flips: UncertainFlip[] = [];

  for (const d of draws) {
    if (d.polarity !== 'uncertain') {
      resolved.push(d);
      continue;
    }

    const isPositive = randomInt(0, 2) === 0;
    const polarity = isPositive ? 'positive' : 'negative';
    const displayText = isPositive
      ? (d.label.posSide ?? d.label.text ?? '')
      : (d.label.negSide ?? d.label.text ?? '');

    resolved.push({ ...d, polarity, displayText });
    flips.push({ label: d.label, polarity, displayText });
  }

  return { resolved, flips };
}

/** True if any draw is a Minaccia or Visione (Severe Consequences trigger). */
export function hasThreatOrVision(draws: DrawnLabel[]): boolean {
  return draws.some((d) => d.isThreatOrVision);
}

// ---------------------------------------------------------------------------
// Input sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize user-provided text to prevent @mention abuse.
 * Replaces @everyone, @here, and Discord mention syntax.
 */
export function sanitizeText(raw: string): string {
  return raw
    .replace(/@everyone/gi, '@\u200Beveryone')
    .replace(/@here/gi, '@\u200Bhere')
    .replace(/<@&\d+>/g, '[role]') // role mentions — must precede user mentions
    .replace(/<@!?\d+>/g, '[mention]') // user mentions (! optional, & excluded)
    .replace(/<#\d+>/g, '[channel]');
}
