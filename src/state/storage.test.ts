import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sampleTeam } from '../data/sample';
import type { AppData } from '../domain/types';
import { defaultData, loadData, parseData, saveData, STORAGE_KEY } from './storage';

/** Minimal in-memory localStorage for the Node test environment. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true, writable: true });
});
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else delete (globalThis as { localStorage?: Storage }).localStorage;
});

function validData(): AppData {
  const team = sampleTeam('Test');
  return { version: 3, settings: { lang: 'es' }, teams: [team], activeTeamId: team.id };
}

describe('defaultData', () => {
  it('starts with one empty team that is active', () => {
    const d = defaultData();
    expect(d.version).toBe(3);
    expect(d.teams).toHaveLength(1);
    expect(d.activeTeamId).toBe(d.teams[0].id);
    expect(d.teams[0].players).toEqual([]);
    expect(['es', 'en']).toContain(d.settings.lang);
  });
});

describe('parseData', () => {
  it('round-trips a valid export unchanged', () => {
    const data = validData();
    expect(parseData(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it('imports v2 exports (no transfer targets) as v3', () => {
    const data = validData();
    const parsed = parseData({ ...JSON.parse(JSON.stringify(data)), version: 2 });
    expect(parsed).toEqual(data);
  });

  it('keeps transfer targets, validates their plan and drops their assignments', () => {
    const parsed = parseData({
      version: 3,
      teams: [{
        id: 't', name: 'T',
        players: [
          { id: 'a', name: 'Planned', positions: {}, target: { slots: { ip: 'DCL', oop: 'DMC' } } },
          { id: 'b', name: 'Bad slot', positions: {}, target: { slots: { ip: 'XX', oop: 7 } } },
          { id: 'c', name: 'Not a target', positions: {}, target: 'yes' },
          { id: 'd', name: 'One slot', positions: {}, target: { slot: 'STC' } },
        ],
        assignments: [{ id: 'x', playerId: 'a', phase: 'ip', tier: 'aux', slot: 'DCL', role: null }],
      }],
    });
    const players = parsed!.teams[0].players;
    expect(players.map((p) => p.target)).toEqual([
      { slots: { ip: 'DCL', oop: 'DMC' } },
      { slots: { ip: null, oop: null } },
      undefined,
      { slots: { ip: 'STC', oop: 'STC' } },
    ]);
    expect(parsed!.teams[0].assignments).toEqual([]);
  });

  it('rejects things that are not exports', () => {
    for (const bad of [null, 42, 'x', [], {}, { version: 2, teams: [] }, { version: 1, teams: [] }, { version: 1, teams: 'no' }]) {
      expect(parseData(bad)).toBeNull();
    }
  });

  it('drops invalid teams, players and assignments but keeps the valid ones', () => {
    const parsed = parseData({
      version: 1,
      teams: [
        { name: 'no id' },
        {
          id: 't', name: 'Valid',
          players: [
            { id: 'p1', name: 'Ok', positions: { ip: { GK: 'natural', XX: 'natural', ST: 'bogus' }, oop: 'nope' } },
            { id: 'p2' },
            'junk',
          ],
          assignments: [
            { id: 'a1', playerId: 'p1', phase: 'ip', tier: 'starter', slot: 'GK', role: 'gk' },
            { id: 'a2', playerId: 'ghost', phase: 'ip', tier: 'starter', slot: 'GK' },
            { id: 'a3', playerId: 'p1', phase: 'mid', tier: 'starter', slot: 'GK' },
            { id: 'a4', playerId: 'p1', phase: 'ip', tier: 'captain', slot: 'GK' },
            { id: 'a5', playerId: 'p1', phase: 'ip', tier: 'aux', slot: 'Z9' },
            { id: 'a6', playerId: 'p1', phase: 'oop', tier: 'main', slot: 'DCL', role: 42 },
          ],
        },
      ],
    });
    expect(parsed).not.toBeNull();
    const team = parsed!.teams[0];
    expect(parsed!.teams).toHaveLength(1);
    // v1 → v2 migration: the player remembers the roles of his assignments.
    expect(team.players).toEqual([
      { id: 'p1', name: 'Ok', positions: { ip: { GK: 'natural' }, oop: {} }, roles: { ip: { GK: 'gk' }, oop: { GK: 'gk' } } },
    ]);
    // a6 was valid, but p1 starts (his lone start gets its out-of-possession partner), and a
    // starter can't be a main sub.
    expect(team.assignments).toMatchObject([
      { id: 'a1', playerId: 'p1', phase: 'ip', tier: 'starter', slot: 'GK', replaces: null },
      { playerId: 'p1', phase: 'oop', tier: 'starter', slot: 'GK' },
    ]);
    expect(team.assignments).toHaveLength(2);
  });

  it('keeps valid sub links and fixes invalid ones', () => {
    const raw = JSON.parse(JSON.stringify(validData()));
    const team = raw.teams[0];
    const sub = team.assignments.find((a: { tier: string }) => a.tier === 'aux');
    const main = team.assignments.find((a: { tier: string }) => a.tier === 'main');
    // A link to someone who doesn't start falls back to the starter of the sub's slot (or nobody);
    // an unknown player id means nobody.
    sub.replaces = main.playerId;
    const parsed = parseData(raw)!.teams[0];
    const slotStarter = parsed.assignments.find((a) => a.phase === sub.phase && a.tier === 'starter' && a.slot === sub.slot);
    expect(parsed.assignments.find((a) => a.id === sub.id)!.replaces).toBe(slotStarter?.playerId ?? null);
    sub.replaces = 'ghost';
    expect(parseData(raw)!.teams[0].assignments.find((a) => a.id === sub.id)!.replaces).toBeNull();
    expect(parsed.assignments.find((a) => a.id === main.id)!.replaces).toBe(main.replaces);
    expect(parsed.assignments.filter((a) => a.tier === 'starter').every((a) => a.replaces === null)).toBe(true);
  });

  it('keeps valid remembered roles and drops invalid ones', () => {
    const data = validData();
    const raw = JSON.parse(JSON.stringify(data));
    raw.teams[0].players[0].roles = {
      ip: { DCL: 'bpcb', STC: 'bpcb', DC: 'cb', GK: 42, MCR: 'custom:Regista' },
      oop: 'nope',
      mid: { DCL: 'cb' },
    };
    raw.teams[0].players[1].roles = { ip: { DCL: 'zzz' } };
    const players = parseData(raw)!.teams[0].players;
    expect(players[0].roles).toEqual({ ip: { DCL: 'bpcb', MCR: 'custom:Regista' } });
    expect(players[1].roles).toBeUndefined();
  });

  it('fixes bad settings and an unknown active team', () => {
    const data = validData();
    const parsed = parseData({ ...data, settings: { lang: 'fr', theme: 'neon' }, activeTeamId: 'missing' })!;
    expect(['es', 'en']).toContain(parsed.settings.lang);
    expect(parsed.settings).not.toHaveProperty('theme'); // old setting, dropped
    expect(parsed.activeTeamId).toBe(data.teams[0].id);
  });

  it('caps very long names', () => {
    const parsed = parseData({
      version: 1,
      teams: [{ id: 't', name: 'x'.repeat(500), players: [{ id: 'p', name: 'y'.repeat(500), positions: {} }], assignments: [] }],
    })!;
    expect(parsed.teams[0].name.length).toBe(60);
    expect(parsed.teams[0].players[0].name.length).toBe(80);
  });
});

describe('loadData / saveData', () => {
  it('returns default data when nothing is stored', () => {
    expect(loadData().teams).toHaveLength(1);
  });

  it('saves and loads the same data', () => {
    const data = validData();
    saveData(data);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(loadData()).toEqual(data);
  });

  it('falls back to defaults when storage holds corrupt data', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadData().teams[0].players).toEqual([]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, teams: [] }));
    expect(loadData().teams[0].players).toEqual([]);
  });

  it('does not throw when storage is unavailable or full', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => { throw new Error('blocked'); },
        setItem: () => { throw new Error('QuotaExceededError'); },
      },
    });
    expect(() => saveData(validData())).not.toThrow();
    expect(loadData().teams).toHaveLength(1);
  });
});
