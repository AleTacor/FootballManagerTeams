import { describe, expect, it } from 'vitest';
import { sampleTeam } from '../data/sample';
import { snapshot } from '../test/helpers';
import { emptyTeam } from './logic';
import { deleteTeam } from './teams';
import type { AppData, Team } from './types';

function data(teams: Team[], activeTeamId = teams[0].id): AppData {
  return { version: 3, settings: { lang: 'es' }, teams, activeTeamId };
}

describe('deleteTeam', () => {
  const a = sampleTeam('A');
  const b = emptyTeam('B');

  it('deletes a team, making the first remaining team active', () => {
    const d = data([a, b], b.id);
    const before = snapshot(d);
    const r = deleteTeam(d, b.id);
    expect(d).toEqual(before);
    expect(r.teams).toEqual([a]);
    expect(r.activeTeamId).toBe(a.id);
    expect(deleteTeam(data([a, b], b.id), a.id).activeTeamId).toBe(b.id); // another team: active stays
  });

  it('clears the last team instead of deleting it', () => {
    const d = data([a]);
    const before = snapshot(d);
    const r = deleteTeam(d, a.id);
    expect(d).toEqual(before);
    expect(r.teams).toEqual([{ ...a, players: [], assignments: [] }]);
    expect(r.activeTeamId).toBe(a.id);
    expect(deleteTeam(r, a.id)).toBe(r); // already empty: no change
    expect(deleteTeam(d, 'nope')).toBe(d);
  });
});
