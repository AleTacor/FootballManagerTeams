import { describe, expect, it } from 'vitest';
import { canPlay, startersCount } from '../domain/logic';
import { roleFits } from '../domain/roles';
import { SLOT_BY_ID } from '../domain/positions';
import { parseData } from '../state/storage';
import { invariantErrors } from '../test/helpers';
import { sampleTeam } from './sample';

describe('example squad', () => {
  const team = sampleTeam('Ejemplo');

  it('has 25 players with unique ids and a full XI in both phases', () => {
    expect(team.players).toHaveLength(25);
    expect(new Set(team.players.map((p) => p.id)).size).toBe(25);
    expect(startersCount(team, 'ip')).toBe(11);
    expect(startersCount(team, 'oop')).toBe(11);
  });

  it('follows every lineup rule', () => {
    expect(invariantErrors(team)).toEqual([]);
  });

  it('has the same starters in both phases', () => {
    const ids = (phase: 'ip' | 'oop') =>
      team.assignments.filter((a) => a.phase === phase && a.tier === 'starter').map((a) => a.playerId).sort();
    expect(ids('ip')).toEqual(ids('oop'));
  });

  it('only uses roles that fit their position and phase', () => {
    for (const a of team.assignments) {
      expect(roleFits(a.role, SLOT_BY_ID[a.slot].pos, a.phase), `${a.slot} ${a.role}`).toBe(true);
    }
  });

  it('places every starter in a position he can play', () => {
    for (const a of team.assignments.filter((x) => x.tier === 'starter')) {
      const p = team.players.find((x) => x.id === a.playerId)!;
      expect(canPlay(p, a.phase, a.slot), `${p.name} at ${a.slot}`).toBe(true);
    }
  });

  it('survives an export/import round trip', () => {
    const data = { version: 1 as const, settings: { lang: 'es' as const, theme: 'dark' as const }, teams: [team], activeTeamId: team.id };
    expect(parseData(JSON.parse(JSON.stringify(data)))?.teams[0]).toEqual(team);
  });
});
