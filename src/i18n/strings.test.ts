import { describe, expect, it } from 'vitest';
import { FAMILIARITY_LEVELS, POS_CODES } from '../domain/positions';
import { FAMILIARITY_LABELS, POS_LABELS, POS_NAMES, STRINGS } from './strings';

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe('translations', () => {
  it('has the same keys in Spanish and English', () => {
    expect(Object.keys(STRINGS.es).sort()).toEqual(Object.keys(STRINGS.en).sort());
  });

  it('has no empty texts', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const [key, value] of Object.entries(STRINGS[lang])) {
        expect(value.trim(), `${lang}.${key}`).not.toBe('');
      }
    }
  });

  it('uses the same {placeholders} in both languages', () => {
    for (const key of Object.keys(STRINGS.en) as (keyof typeof STRINGS.en)[]) {
      expect(placeholders(STRINGS.es[key]), key).toEqual(placeholders(STRINGS.en[key]));
    }
  });

  it('labels and names every position and familiarity level, without duplicates', () => {
    for (const lang of ['es', 'en'] as const) {
      const pos = POS_CODES.map((c) => POS_LABELS[lang][c]);
      expect(pos.every(Boolean)).toBe(true);
      expect(new Set(pos).size).toBe(pos.length);
      const names = POS_CODES.map((c) => POS_NAMES[lang][c]);
      expect(names.every(Boolean)).toBe(true);
      expect(new Set(names).size).toBe(names.length);
      for (const f of FAMILIARITY_LEVELS) expect(FAMILIARITY_LABELS[lang][f]).toBeTruthy();
    }
  });
});
