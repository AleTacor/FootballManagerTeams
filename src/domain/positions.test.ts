import { describe, expect, it } from 'vitest';
import {
  FAMILIARITY_LEVELS, FAMILIARITY_RANK, mergePositions, POS_CODES, POS_GRID, POS_GROUP, SLOT_BY_ID, SLOT_ORDER, SLOTS,
} from './positions';
import type { PositionMap } from './types';

describe('pitch slots', () => {
  it('has 24 unique slots inside the pitch, each mapped to a known position', () => {
    expect(SLOTS).toHaveLength(24);
    expect(new Set(SLOTS.map((s) => s.id)).size).toBe(24);
    for (const s of SLOTS) {
      expect(POS_CODES).toContain(s.pos);
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(100);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(100);
    }
  });

  it('gives every position at least one slot', () => {
    for (const code of POS_CODES) expect(SLOTS.some((s) => s.pos === code), code).toBe(true);
  });

  it('does not stack two slots on the same spot', () => {
    const spots = SLOTS.map((s) => `${s.x},${s.y}`);
    expect(new Set(spots).size).toBe(spots.length);
  });

  it('puts the goalkeeper at the bottom and strikers at the top (attack goes up)', () => {
    const gk = SLOT_BY_ID.GK;
    expect(SLOTS.every((s) => s.y <= gk.y)).toBe(true);
    expect(SLOT_BY_ID.STC.y).toBeLessThan(SLOT_BY_ID.AMCC.y);
  });

  it('indexes slots by id and lists them defence first', () => {
    for (const s of SLOTS) expect(SLOT_BY_ID[s.id]).toBe(s);
    expect(SLOT_ORDER[0]).toBe('GK');
    expect(SLOT_ORDER).toHaveLength(24);
  });
});

describe('positions and familiarity', () => {
  it('shows every position exactly once in the picker grid', () => {
    const cells = POS_GRID.flat().filter(Boolean);
    expect([...cells].sort()).toEqual([...POS_CODES].sort());
  });

  it('assigns a group to every position', () => {
    for (const code of POS_CODES) expect(['gk', 'def', 'mid', 'att']).toContain(POS_GROUP[code]);
  });

  it('ranks every familiarity level, natural best', () => {
    expect(Object.keys(FAMILIARITY_RANK).sort()).toEqual([...FAMILIARITY_LEVELS].sort());
    expect(FAMILIARITY_RANK.natural).toBe(0);
    expect(FAMILIARITY_RANK.ineffectual).toBeGreaterThan(FAMILIARITY_RANK.awkward);
  });
});

describe('mergePositions', () => {
  it('keeps every position from both phases at the better familiarity', () => {
    const ip: PositionMap = { AMC: 'natural', MC: 'competent', ST: 'unknown' };
    const oop: PositionMap = { ST: 'accomplished', AMC: 'natural', MC: 'awkward', DM: 'unconvincing' };
    const before = JSON.stringify([ip, oop]);
    expect(mergePositions(ip, oop)).toEqual({ AMC: 'natural', MC: 'competent', ST: 'accomplished', DM: 'unconvincing' });
    expect(JSON.stringify([ip, oop])).toBe(before);
  });

  it('treats unknown as worse than competent but better than unconvincing', () => {
    expect(mergePositions({ DC: 'unknown' }, { DC: 'competent' })).toEqual({ DC: 'competent' });
    expect(mergePositions({ DC: 'unknown' }, { DC: 'unconvincing' })).toEqual({ DC: 'unknown' });
    expect(mergePositions({}, {})).toEqual({});
  });
});
