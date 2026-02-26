import { describe, it, expect } from 'vitest';
import {
  createLabel,
  resolveLabel,
  drawFromBag,
  summarizeDraws,
  resolveUncertainDraws,
  hasThreatOrVision,
  sanitizeText,
  THREAT_VISION_TYPES,
} from '../src/lib/domain.js';
import type { Label } from '../src/lib/domain.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLabel(type: Label['type'], text = 'test'): Label {
  return createLabel(type, text);
}

// ---------------------------------------------------------------------------
// resolveLabel
// ---------------------------------------------------------------------------

describe('resolveLabel — always-positive types', () => {
  it('resolves tratto as positive', () => {
    const d = resolveLabel(makeLabel('tratto'));
    expect(d.polarity).toBe('positive');
    expect(d.isThreatOrVision).toBe(false);
  });

  it('resolves risorsa as positive', () => {
    const d = resolveLabel(makeLabel('risorsa'));
    expect(d.polarity).toBe('positive');
    expect(d.isThreatOrVision).toBe(false);
  });

  it.each(['tratto-nome', 'tratto-archetipo'] as const)(
    'resolves %s as positive (tratto subtype)',
    (type) => {
      const d = resolveLabel(makeLabel(type));
      expect(d.polarity).toBe('positive');
      expect(d.isThreatOrVision).toBe(false);
    }
  );
});

describe('resolveLabel — always-negative types', () => {
  it.each(['condizione', 'terrore', 'rassegnazione'] as const)(
    'resolves %s as negative, not threat',
    (type) => {
      const d = resolveLabel(makeLabel(type));
      expect(d.polarity).toBe('negative');
      expect(d.isThreatOrVision).toBe(false);
    }
  );

  it('resolves rassegnazione with no text (empty displayText)', () => {
    const label = createLabel('rassegnazione'); // text defaults to '' → stored as undefined
    expect(label.text).toBeUndefined();
    const d = resolveLabel(label);
    expect(d.polarity).toBe('negative');
    expect(d.displayText).toBe('');
    expect(d.isThreatOrVision).toBe(false);
  });

  it.each(['minaccia', 'visione'] as const)(
    'resolves %s as negative and isThreatOrVision',
    (type) => {
      const d = resolveLabel(makeLabel(type));
      expect(d.polarity).toBe('negative');
      expect(d.isThreatOrVision).toBe(true);
      expect(THREAT_VISION_TYPES.has(type)).toBe(true);
    }
  );
});

describe('resolveLabel — tratto-segnato (uncertain at draw time)', () => {
  it('resolves as uncertain — no coin flip at draw time', () => {
    const label = makeLabel('tratto-segnato', 'BaseText');
    const d = resolveLabel(label);
    expect(d.polarity).toBe('uncertain');
    expect(d.isThreatOrVision).toBe(false);
  });

  it('displayText uses posSide when available', () => {
    const label = createLabel('tratto-segnato', 'fallback', undefined, 'LightSide', 'DarkSide');
    const d = resolveLabel(label);
    expect(d.polarity).toBe('uncertain');
    expect(d.displayText).toBe('LightSide');
  });

  it('falls back to label.text when posSide is not set', () => {
    const label = makeLabel('tratto-segnato', 'BaseText');
    const d = resolveLabel(label);
    expect(d.displayText).toBe('BaseText');
  });
});

// ---------------------------------------------------------------------------
// drawFromBag
// ---------------------------------------------------------------------------

describe('drawFromBag', () => {
  it('draws the correct number of labels', () => {
    const bag = [
      makeLabel('tratto', 'A'),
      makeLabel('risorsa', 'B'),
      makeLabel('condizione', 'C'),
      makeLabel('minaccia', 'D'),
    ];
    const { drawn, remaining } = drawFromBag(bag, 2);
    expect(drawn).toHaveLength(2);
    expect(remaining).toHaveLength(2);
  });

  it('draws without replacement (each label appears at most once)', () => {
    const bag = Array.from({ length: 6 }, (_, i) => makeLabel('tratto', `T${i}`));
    const { drawn } = drawFromBag(bag, 6);
    const ids = drawn.map((d) => d.label.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(6);
  });

  it('handles count > bag size — draws all', () => {
    const bag = [makeLabel('tratto', 'only')];
    const { drawn, remaining } = drawFromBag(bag, 5);
    expect(drawn).toHaveLength(1);
    expect(remaining).toHaveLength(0);
  });

  it('handles empty bag', () => {
    const { drawn, remaining } = drawFromBag([], 3);
    expect(drawn).toHaveLength(0);
    expect(remaining).toHaveLength(0);
  });

  it('handles count of 0', () => {
    const bag = [makeLabel('tratto', 'A')];
    const { drawn, remaining } = drawFromBag(bag, 0);
    expect(drawn).toHaveLength(0);
    expect(remaining).toHaveLength(1);
  });

  it('does not mutate the original bag array', () => {
    const bag = [makeLabel('tratto', 'A'), makeLabel('risorsa', 'B')];
    const originalLength = bag.length;
    drawFromBag(bag, 1);
    expect(bag).toHaveLength(originalLength); // original unchanged
  });
});

// ---------------------------------------------------------------------------
// summarizeDraws
// ---------------------------------------------------------------------------

describe('summarizeDraws', () => {
  it('counts positive and negative correctly', () => {
    const bag = [
      makeLabel('tratto'),
      makeLabel('risorsa'),
      makeLabel('condizione'),
      makeLabel('minaccia'),
    ];
    const { drawn } = drawFromBag(bag, 4);
    // Force polarity by type
    const positives = drawn.filter((d) => d.polarity === 'positive');
    const negatives = drawn.filter((d) => d.polarity === 'negative');
    const { positiveCount, negativeCount, uncertainCount } = summarizeDraws(drawn);
    expect(positiveCount).toBe(positives.length);
    expect(negativeCount).toBe(negatives.length);
    expect(uncertainCount).toBe(0);
    expect(positiveCount + negativeCount).toBe(4);
  });

  it('counts uncertain separately', () => {
    const bag = [makeLabel('tratto-segnato', 'TS'), makeLabel('tratto'), makeLabel('condizione')];
    const { drawn } = drawFromBag(bag, 3);
    const { positiveCount, negativeCount, uncertainCount } = summarizeDraws(drawn);
    expect(uncertainCount).toBe(1);
    expect(positiveCount).toBe(1); // tratto
    expect(negativeCount).toBe(1); // condizione
    expect(positiveCount + negativeCount + uncertainCount).toBe(3);
  });

  it('handles empty array', () => {
    const { positiveCount, negativeCount, uncertainCount } = summarizeDraws([]);
    expect(positiveCount).toBe(0);
    expect(negativeCount).toBe(0);
    expect(uncertainCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resolveUncertainDraws
// ---------------------------------------------------------------------------

describe('resolveUncertainDraws', () => {
  it('passes through non-uncertain draws unchanged', () => {
    const bag = [makeLabel('tratto'), makeLabel('condizione'), makeLabel('minaccia')];
    const { drawn } = drawFromBag(bag, 3);
    const { resolved, flips } = resolveUncertainDraws(drawn);
    expect(resolved).toHaveLength(3);
    expect(flips).toHaveLength(0);
    for (const d of resolved) {
      expect(d.polarity).not.toBe('uncertain');
    }
  });

  it('resolves uncertain draws to positive or negative (coin flip)', () => {
    const label = createLabel('tratto-segnato', 'T', undefined, 'LightSide', 'DarkSide');
    const bag = [label];
    const { drawn } = drawFromBag(bag, 1);
    expect(drawn[0].polarity).toBe('uncertain');

    // Run many times to verify both outcomes are possible
    const polarities = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const { resolved } = resolveUncertainDraws(drawn);
      polarities.add(resolved[0].polarity);
    }
    expect(polarities.has('positive')).toBe(true);
    expect(polarities.has('negative')).toBe(true);
  });

  it('returns a flip entry for each resolved uncertain draw', () => {
    const label = createLabel('tratto-segnato', 'T', undefined, 'Light', 'Dark');
    const bag = [label];
    const { drawn } = drawFromBag(bag, 1);
    const { flips } = resolveUncertainDraws(drawn);
    expect(flips).toHaveLength(1);
    expect(['positive', 'negative']).toContain(flips[0].polarity);
  });

  it('uses posSide text on positive resolution', () => {
    const label = createLabel('tratto-segnato', 'fallback', undefined, 'LightSide', 'DarkSide');
    const bag = [label];
    const { drawn } = drawFromBag(bag, 1);
    let found = false;
    for (let i = 0; i < 500 && !found; i++) {
      const { resolved, flips } = resolveUncertainDraws(drawn);
      if (resolved[0].polarity === 'positive') {
        expect(resolved[0].displayText).toBe('LightSide');
        expect(flips[0].displayText).toBe('LightSide');
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('uses negSide text on negative resolution', () => {
    const label = createLabel('tratto-segnato', 'fallback', undefined, 'LightSide', 'DarkSide');
    const bag = [label];
    const { drawn } = drawFromBag(bag, 1);
    let found = false;
    for (let i = 0; i < 500 && !found; i++) {
      const { resolved, flips } = resolveUncertainDraws(drawn);
      if (resolved[0].polarity === 'negative') {
        expect(resolved[0].displayText).toBe('DarkSide');
        expect(flips[0].displayText).toBe('DarkSide');
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('handles empty input', () => {
    const { resolved, flips } = resolveUncertainDraws([]);
    expect(resolved).toHaveLength(0);
    expect(flips).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// hasThreatOrVision
// ---------------------------------------------------------------------------

describe('hasThreatOrVision', () => {
  it('returns false for empty draws', () => {
    expect(hasThreatOrVision([])).toBe(false);
  });

  it('returns false when no minaccia/visione', () => {
    const bag = [makeLabel('tratto'), makeLabel('condizione'), makeLabel('terrore')];
    const { drawn } = drawFromBag(bag, 3);
    expect(hasThreatOrVision(drawn)).toBe(false);
  });

  it('returns true when minaccia is drawn', () => {
    const bag = [makeLabel('minaccia')];
    const { drawn } = drawFromBag(bag, 1);
    expect(hasThreatOrVision(drawn)).toBe(true);
  });

  it('returns true when visione is drawn', () => {
    const bag = [makeLabel('visione')];
    const { drawn } = drawFromBag(bag, 1);
    expect(hasThreatOrVision(drawn)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sanitizeText
// ---------------------------------------------------------------------------

describe('sanitizeText', () => {
  it('suppresses @everyone', () => {
    expect(sanitizeText('hello @everyone')).not.toContain('@everyone');
  });

  it('suppresses @here', () => {
    expect(sanitizeText('hey @here!')).not.toContain('@here');
  });

  it('replaces user mentions', () => {
    expect(sanitizeText('<@123456789>')).toBe('[mention]');
  });

  it('replaces channel mentions', () => {
    expect(sanitizeText('<#123456789>')).toBe('[channel]');
  });

  it('replaces role mentions', () => {
    expect(sanitizeText('<@&123456789>')).toBe('[role]');
  });

  it('leaves normal text unchanged', () => {
    expect(sanitizeText('Coraggio del Guerriero')).toBe('Coraggio del Guerriero');
  });
});
