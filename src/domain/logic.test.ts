import { describe, expect, it } from 'vitest';
import { sampleTeam } from '../data/sample';
import { asg, invariantErrors, player, rng, snapshot, team } from '../test/helpers';
import {
  assignPlayer, auxOf, canPlay, copyTeam, emptyTeam, familiarityAt, isStarter, mainOf, MAX_STARTERS,
  moveAssignment, promoteToMain, removeAssignment, removePlayer, setReplaces, setRole, sortByFamiliarity,
  linkLineup, outfieldCount, planTarget, promoteToStarter, setTargetRole, signTarget, starterAssignment, starterOf, startersCount, uid,
  upsertPlayer,
} from './logic';
import { SLOTS } from './positions';
import type { Assignment, Phase, Player, SlotId, Team, Tier } from './types';

const cb1 = player('Ana', { DC: 'natural' }, { DC: 'natural', DM: 'competent' });
const cb2 = player('Bea', { DC: 'accomplished', DR: 'natural' });
const cb3 = player('Cris', { DC: 'unknown' });
const st = player('Dani', { ST: 'natural' });

/** Team with placeholder starters in these slots (both phases), so main subs can go there. */
function withXI(slots: SlotId[], players: Player[], assignments: Assignment[] = []) {
  const xi = slots.map((s) => player(`XI-${s}`, {}));
  const starts = xi.flatMap((p, i) => (['ip', 'oop'] as Phase[]).map((ph) => asg(p.id, ph, 'starter', slots[i])));
  return team([...players, ...xi], [...starts, ...assignments]);
}
const subsOf = (t: Team) => t.assignments.filter((a) => a.tier !== 'starter');

describe('queries', () => {
  it('reads familiarity for the slot position and phase', () => {
    expect(familiarityAt(cb1, 'ip', 'DCL')).toBe('natural');
    expect(familiarityAt(cb1, 'ip', 'DMC')).toBeNull();
    expect(familiarityAt(cb1, 'oop', 'DMC')).toBe('competent');
    expect(familiarityAt(undefined, 'ip', 'GK')).toBeNull();
    expect(canPlay(st, 'ip', 'STL')).toBe(true);
    expect(canPlay(st, 'ip', 'AMCC')).toBe(false);
  });

  it('finds starters, main and aux subs per slot and phase', () => {
    const t = team([cb1, cb2, cb3], [
      asg(cb1.id, 'ip', 'starter', 'DCL', 'cb'),
      asg(cb2.id, 'ip', 'main', 'DCL'),
      asg(cb3.id, 'ip', 'aux', 'DCL'),
      asg(cb1.id, 'oop', 'starter', 'DCR'),
    ]);
    expect(starterOf(t, 'ip', 'DCL')?.playerId).toBe(cb1.id);
    expect(starterOf(t, 'oop', 'DCL')).toBeUndefined();
    expect(mainOf(t, 'ip', 'DCL')?.playerId).toBe(cb2.id);
    expect(auxOf(t, 'ip', 'DCL').map((a) => a.playerId)).toEqual([cb3.id]);
    expect(startersCount(t, 'ip')).toBe(1);
    expect(isStarter(t, cb1.id, 'oop')).toBe(true);
    expect(isStarter(t, cb2.id, 'ip')).toBe(false);
    expect(starterAssignment(t, cb1.id, 'oop')?.slot).toBe('DCR');
  });

  it('sorts candidates by familiarity, then name, with non-players last', () => {
    const sorted = sortByFamiliarity([st, cb3, cb2, cb1], 'ip', 'DCC');
    expect(sorted.map((p) => p.name)).toEqual(['Ana', 'Bea', 'Cris', 'Dani']);
    const tie = [player('Zoe', { DC: 'natural' }), player('Ana', { DC: 'natural' })];
    expect(sortByFamiliarity(tie, 'ip', 'DCC').map((p) => p.name)).toEqual(['Ana', 'Zoe']);
  });

  it('ranks unknown familiarity after competent and before unconvincing', () => {
    const list = [
      player('U', { GK: 'unconvincing' }),
      player('K', { GK: 'unknown' }),
      player('C', { GK: 'competent' }),
    ];
    expect(sortByFamiliarity(list, 'ip', 'GK').map((p) => p.name)).toEqual(['C', 'K', 'U']);
  });
});

describe('assignPlayer — starters', () => {
  it('creates a starter in an empty slot without mutating the input', () => {
    const t = team([cb1]);
    const before = snapshot(t);
    const r = assignPlayer(t, cb1.id, 'ip', 'DCL', 'starter');
    expect(r.error).toBeUndefined();
    expect(starterOf(r.team, 'ip', 'DCL')?.playerId).toBe(cb1.id);
    expect(t).toEqual(before);
  });

  it(`refuses a starter number ${MAX_STARTERS + 1} and returns the same team`, () => {
    const players = Array.from({ length: 12 }, (_, i) => player(`P${i}`, { DC: 'natural' }));
    const slots = SLOTS.slice(0, 11).map((s) => s.id);
    const t = team(players, slots.map((s, i) => asg(players[i].id, 'ip', 'starter', s)));
    const free = SLOTS.find((s) => !slots.includes(s.id))!.id;
    const r = assignPlayer(t, players[11].id, 'ip', free, 'starter');
    expect(r.error).toBe('tooManyStarters');
    expect(r.team).toBe(t);
  });

  it('mirrors a starter replacement in the other phase with the incoming player’s roles', () => {
    const incoming = { ...cb2, roles: { ip: { DCL: 'nncb' }, oop: { DCR: 'scb' } } };
    const t = team([cb1, incoming], [
      asg(cb1.id, 'ip', 'starter', 'DCL', 'bpcb'),
      asg(cb1.id, 'oop', 'starter', 'DCR', 'ccb'),
    ]);
    const r = assignPlayer(t, cb2.id, 'ip', 'DCL', 'starter').team;
    expect(starterOf(r, 'ip', 'DCL')).toMatchObject({ playerId: cb2.id, role: 'nncb' });
    expect(starterOf(r, 'oop', 'DCR')).toMatchObject({ playerId: cb2.id, role: 'scb' });
  });

  it('replaces the occupant with the default role (not his) and mirrors it in the other phase', () => {
    const t = team([cb1, cb2], [
      asg(cb1.id, 'ip', 'starter', 'DCL', 'bpcb'),
      asg(cb1.id, 'oop', 'starter', 'DCR', 'ccb'),
    ]);
    const r = assignPlayer(t, cb2.id, 'ip', 'DCL', 'starter');
    expect(starterOf(r.team, 'ip', 'DCL')).toMatchObject({ playerId: cb2.id, role: 'cb' });
    expect(starterOf(r.team, 'oop', 'DCR')).toMatchObject({ playerId: cb2.id, role: 'cb' });
    expect(isStarter(r.team, cb1.id, 'ip')).toBe(false);
    expect(isStarter(r.team, cb1.id, 'oop')).toBe(false);
  });

  it('with unlinked data, drops the replaced player’s lone start instead of mirroring', () => {
    const t = team([cb1, cb2], [
      asg(cb1.id, 'ip', 'starter', 'DCL'),
      asg(cb1.id, 'oop', 'starter', 'DCR'),
      asg(cb2.id, 'oop', 'starter', 'DCL'),
    ]);
    const r = assignPlayer(t, cb2.id, 'ip', 'DCL', 'starter');
    expect(starterOf(r.team, 'oop', 'DCR')).toBeUndefined();
    expect(starterOf(r.team, 'oop', 'DCL')?.playerId).toBe(cb2.id);
    expect(invariantErrors(r.team)).toEqual([]);
  });

  it('starts a new starter in the other phase too, in the same slot when it is free', () => {
    const r = assignPlayer(team([cb1]), cb1.id, 'ip', 'DCL', 'starter').team;
    expect(starterOf(r, 'oop', 'DCL')).toMatchObject({ playerId: cb1.id, role: 'cb' });
    expect(invariantErrors(r)).toEqual([]);
  });

  it('uses the nearest free slot of the same position when that slot is taken in the other phase', () => {
    const t = team([cb1, cb2, st], [asg(cb2.id, 'ip', 'starter', 'DCR'), asg(cb2.id, 'oop', 'starter', 'DCL')]);
    const r = assignPlayer(t, cb1.id, 'ip', 'DCL', 'starter').team;
    expect(starterOf(r, 'oop', 'DCC')?.playerId).toBe(cb1.id);
    // No free slot of the position: one he can play, else the nearest.
    const forwards = team([st, cb1, cb2, cb3], [
      asg(cb1.id, 'ip', 'starter', 'DCL'), asg(cb1.id, 'oop', 'starter', 'STL'),
      asg(cb2.id, 'ip', 'starter', 'DCC'), asg(cb2.id, 'oop', 'starter', 'STC'),
      asg(cb3.id, 'ip', 'starter', 'DCR'), asg(cb3.id, 'oop', 'starter', 'STR'),
    ]);
    const r2 = assignPlayer(forwards, st.id, 'ip', 'STC', 'starter').team;
    expect(starterAssignment(r2, st.id, 'oop')?.slot).toBe('AMCC');
    expect(invariantErrors(r2)).toEqual([]);
  });

  it('refuses a starter as main sub, anywhere', () => {
    const t = team([cb1], [asg(cb1.id, 'ip', 'starter', 'DCL'), asg(cb1.id, 'oop', 'starter', 'DCR')]);
    expect(assignPlayer(t, cb1.id, 'ip', 'DCL', 'main')).toEqual({ team: t, error: 'starterNotMain' });
    expect(assignPlayer(t, cb1.id, 'oop', 'DMC', 'main')).toEqual({ team: t, error: 'starterNotMain' });
  });

  it('removes the start in both phases', () => {
    const a1 = asg(cb1.id, 'ip', 'starter', 'DCL');
    const t = team([cb1, cb2], [a1, asg(cb1.id, 'oop', 'starter', 'MCR'), asg(cb1.id, 'oop', 'aux', 'DCR')]);
    const r = removeAssignment(t, a1.id);
    expect(r.assignments.map((a) => a.tier)).toEqual(['aux']);
  });

  it('links lone starts of older data', () => {
    const t = team([cb1, cb2], [asg(cb1.id, 'ip', 'starter', 'DCL'), asg(cb2.id, 'oop', 'starter', 'DCL')]);
    const before = snapshot(t);
    const r = linkLineup(t);
    expect(starterAssignment(r, cb1.id, 'oop')?.slot).toBe('DCC');
    expect(starterAssignment(r, cb2.id, 'ip')?.slot).toBe('DCC');
    expect(invariantErrors(r)).toEqual([]);
    expect(t).toEqual(before);
    expect(linkLineup(r)).toBe(r);
  });

  it('swaps two starters of the same phase, each with his own role (default if none)', () => {
    const t = team([cb1, { ...cb2, roles: { ip: { DCL: 'nncb' } } }], [
      asg(cb1.id, 'ip', 'starter', 'DCL', 'acb'),
      asg(cb2.id, 'ip', 'starter', 'DCR', 'bpcb'),
    ]);
    const r = assignPlayer(t, cb2.id, 'ip', 'DCL', 'starter');
    expect(starterOf(r.team, 'ip', 'DCL')).toMatchObject({ playerId: cb2.id, role: 'nncb' });
    expect(starterOf(r.team, 'ip', 'DCR')).toMatchObject({ playerId: cb1.id, role: 'cb' });
  });

  it('moves a starter to an empty slot with the default role there (roles stay with their slot)', () => {
    const t = team([cb1], [asg(cb1.id, 'ip', 'starter', 'DCL', 'bpcb')]);
    const sameGroup = assignPlayer(t, cb1.id, 'ip', 'DCR', 'starter').team;
    expect(starterOf(sameGroup, 'ip', 'DCR')?.role).toBe('cb');
    const otherGroup = assignPlayer(t, cb1.id, 'ip', 'DMC', 'starter').team;
    expect(starterOf(otherGroup, 'ip', 'DMC')?.role).toBe('dm');
    expect(startersCount(otherGroup, 'ip')).toBe(1);
  });

  it('brings back a remembered custom role', () => {
    const t = team([{ ...cb1, roles: { ip: { DMC: 'custom:Libero' } } }], [asg(cb1.id, 'ip', 'starter', 'DCL', 'cb')]);
    const r = assignPlayer(t, cb1.id, 'ip', 'DMC', 'starter');
    expect(starterOf(r.team, 'ip', 'DMC')?.role).toBe('custom:Libero');
  });

  it('is a no-op when the player already starts in that slot', () => {
    const t = team([cb1], [asg(cb1.id, 'ip', 'starter', 'DCL')]);
    expect(assignPlayer(t, cb1.id, 'ip', 'DCL', 'starter').team).toBe(t);
  });

  it('removes every main sub spot of a main sub who becomes a starter, but keeps his aux spots elsewhere', () => {
    const t = team([cb1, cb2], [
      asg(cb2.id, 'ip', 'starter', 'DCL'), asg(cb2.id, 'oop', 'starter', 'DCL'),
      asg(cb1.id, 'ip', 'main', 'DCL', null, cb2.id),
      asg(cb1.id, 'oop', 'main', 'DCR', null, cb2.id),
      asg(cb1.id, 'ip', 'aux', 'DMC', null, cb2.id),
    ]);
    const r = assignPlayer(t, cb1.id, 'ip', 'DCL', 'starter').team;
    expect(r.assignments.filter((a) => a.tier === 'main')).toEqual([]);
    // His aux spot came on for cb2, whom he replaced; it can't come on for himself, and there's
    // no other starter.
    expect(auxOf(r, 'ip', 'DMC')[0]).toMatchObject({ playerId: cb1.id, replaces: null });
    expect(invariantErrors(r)).toEqual([]);
  });
});

describe('assignPlayer — substitutes', () => {
  it('creates a main sub and lets one player be main sub in several slots', () => {
    let t = withXI(['DCL', 'DCR'], [cb1]);
    t = assignPlayer(t, cb1.id, 'ip', 'DCL', 'main').team;
    t = assignPlayer(t, cb1.id, 'ip', 'DCR', 'main').team;
    expect(mainOf(t, 'ip', 'DCL')?.playerId).toBe(cb1.id);
    expect(mainOf(t, 'ip', 'DCR')?.playerId).toBe(cb1.id);
  });

  it('replaces the main sub with the default role, not the previous one', () => {
    const t = withXI(['DCL'], [cb1, cb2], [asg(cb1.id, 'ip', 'main', 'DCL', 'nncb')]);
    const r = assignPlayer(t, cb2.id, 'ip', 'DCL', 'main');
    expect(mainOf(r.team, 'ip', 'DCL')).toMatchObject({ playerId: cb2.id, role: 'cb' });
    expect(subsOf(r.team).filter((a) => a.phase === 'ip')).toHaveLength(1);
  });

  it('mirrors a main sub replacement in the other phase, with the incoming player’s roles', () => {
    const incoming = { ...cb2, roles: { ip: { DCL: 'bpcb' }, oop: { DCR: 'ccb' } } };
    const t = withXI(['DCL', 'DCR'], [cb1, incoming, cb3], [
      asg(cb1.id, 'ip', 'main', 'DCL', 'nncb'),
      asg(cb1.id, 'oop', 'main', 'DCR', 'scb'),
      asg(cb2.id, 'oop', 'aux', 'DCR'),
    ]);
    const before = snapshot(t);
    const r = assignPlayer(t, cb2.id, 'ip', 'DCL', 'main').team;
    expect(mainOf(r, 'ip', 'DCL')).toMatchObject({ playerId: cb2.id, role: 'bpcb' });
    expect(mainOf(r, 'oop', 'DCR')).toMatchObject({ playerId: cb2.id, role: 'ccb' });
    expect(auxOf(r, 'oop', 'DCR')).toHaveLength(0);
    expect(r.assignments.some((a) => a.playerId === cb1.id)).toBe(false);
    expect(t).toEqual(before);
    expect(invariantErrors(r)).toEqual([]);
  });

  it('mirrors a main sub replacement in the spot replacing the same starter, not by slot', () => {
    const t = team([cb1, cb2, cb3, st], [
      asg(cb3.id, 'ip', 'starter', 'DCL'), asg(cb3.id, 'oop', 'starter', 'DCC'),
      asg(st.id, 'ip', 'starter', 'STC'), asg(st.id, 'oop', 'starter', 'STC'),
      asg(cb1.id, 'ip', 'main', 'DCL', null, cb3.id),
      asg(cb1.id, 'oop', 'main', 'DCR', null, cb3.id),
      asg(cb1.id, 'oop', 'main', 'DCL', null, st.id),
    ]);
    const r = assignPlayer(t, cb2.id, 'ip', 'DCL', 'main').team;
    expect(mainOf(r, 'oop', 'DCR')).toMatchObject({ playerId: cb2.id, replaces: cb3.id });
    // cb1 is no main sub in possession any more, so he leaves out of possession too.
    expect(mainOf(r, 'oop', 'DCL')).toBeUndefined();
    expect(invariantErrors(r)).toEqual([]);
  });

  it('without a clear mirror, the replaced player leaves both phases and the incoming one gets a linked spot', () => {
    const several = withXI(['DCL', 'DCR', 'DCC'], [cb1, cb2], [
      asg(cb1.id, 'ip', 'main', 'DCL'),
      asg(cb1.id, 'oop', 'main', 'DCR'),
      asg(cb1.id, 'oop', 'main', 'DCC'),
    ]);
    const r1 = assignPlayer(several, cb2.id, 'ip', 'DCL', 'main').team;
    expect(subsOf(r1).filter((a) => a.phase === 'oop').map((a) => `${a.playerId} ${a.slot}`)).toEqual([`${cb2.id} DCL`]);
  });

  it('makes a new main sub main sub in the other phase too, covering the same starter', () => {
    const t = team([cb1, cb2], [asg(cb1.id, 'ip', 'starter', 'DCL'), asg(cb1.id, 'oop', 'starter', 'DCR')]);
    const r = assignPlayer(t, cb2.id, 'ip', 'DCL', 'main').team;
    expect(mainOf(r, 'oop', 'DCR')).toMatchObject({ playerId: cb2.id, role: 'cb' });
    expect(invariantErrors(r)).toEqual([]);
  });

  it('removes a main sub from the other phase once he is main sub nowhere in this one', () => {
    const m1 = asg(cb1.id, 'ip', 'main', 'DCL');
    const m2 = asg(cb1.id, 'ip', 'main', 'DCR');
    const t = withXI(['DCL', 'DCR'], [cb1], [m1, m2, asg(cb1.id, 'oop', 'main', 'DCL'), asg(cb1.id, 'oop', 'aux', 'DCC')]);
    const one = removeAssignment(t, m1.id);
    expect(one.assignments.filter((a) => a.tier === 'main')).toHaveLength(2);
    const none = removeAssignment(one, m2.id);
    expect(subsOf(none).map((a) => a.tier)).toEqual(['aux']);
    expect(invariantErrors(none)).toEqual([]);
  });

  it('links mains on promote and demote', () => {
    const main = asg(cb1.id, 'ip', 'main', 'DCL');
    const aux = asg(cb2.id, 'ip', 'aux', 'DCL');
    const t = withXI(['DCL'], [cb1, cb2], [main, aux, asg(cb1.id, 'oop', 'main', 'DCL')]);
    const r = promoteToMain(t, aux.id);
    expect(mainOf(r, 'oop', 'DCL')?.playerId).toBe(cb2.id);
    expect(r.assignments.filter((a) => a.playerId === cb1.id).map((a) => `${a.phase} ${a.tier}`)).toEqual(['ip aux']);
    expect(invariantErrors(r)).toEqual([]);
  });

  it('turns an aux sub into the main sub, carrying his role', () => {
    const t = withXI(['DCL'], [cb1], [asg(cb1.id, 'ip', 'aux', 'DCL', 'cb')]);
    const r = assignPlayer(t, cb1.id, 'ip', 'DCL', 'main');
    expect(mainOf(r.team, 'ip', 'DCL')).toMatchObject({ playerId: cb1.id, role: 'cb' });
    expect(auxOf(r.team, 'ip', 'DCL')).toHaveLength(0);
  });

  it('adds aux subs, ignoring duplicates and the slot’s own starter or main sub', () => {
    const t = team([cb1, cb2, cb3], [
      asg(cb1.id, 'ip', 'starter', 'DCL'),
      asg(cb2.id, 'ip', 'main', 'DCL'),
    ]);
    const r = assignPlayer(t, cb3.id, 'ip', 'DCL', 'aux');
    expect(auxOf(r.team, 'ip', 'DCL').map((a) => a.playerId)).toEqual([cb3.id]);
    expect(assignPlayer(r.team, cb3.id, 'ip', 'DCL', 'aux').team).toBe(r.team);
    expect(assignPlayer(t, cb1.id, 'ip', 'DCL', 'aux').team).toBe(t);
    expect(assignPlayer(t, cb2.id, 'ip', 'DCL', 'aux').team).toBe(t);
  });

  it('adds a main sub where nobody starts as an aux sub, replacing nobody', () => {
    const t = withXI(['DCL'], [cb1]);
    const r = assignPlayer(t, cb1.id, 'ip', 'DCR', 'main').team;
    expect(mainOf(r, 'ip', 'DCR')).toBeUndefined();
    expect(auxOf(r, 'ip', 'DCR')[0]).toMatchObject({ playerId: cb1.id, replaces: null });
    expect(promoteToMain(r, auxOf(r, 'ip', 'DCR')[0].id)).toBe(r);
    expect(invariantErrors(r)).toEqual([]);
  });

  it('allows a starter to be an aux sub in another slot, never main', () => {
    const t = team([cb1, cb2], [
      asg(cb1.id, 'ip', 'starter', 'DCL'), asg(cb1.id, 'oop', 'starter', 'DCL'),
      asg(cb2.id, 'ip', 'starter', 'DMC'), asg(cb2.id, 'oop', 'starter', 'DMC'),
    ]);
    const r = assignPlayer(t, cb1.id, 'ip', 'DMC', 'aux').team;
    expect(auxOf(r, 'ip', 'DMC')[0]).toMatchObject({ playerId: cb1.id, replaces: cb2.id });
    expect(isStarter(r, cb1.id, 'ip')).toBe(true);
    const aux = auxOf(r, 'ip', 'DMC')[0];
    expect(promoteToMain(r, aux.id)).toBe(r);
  });
});

describe('moveAssignment', () => {
  it('moves to an empty slot and swaps with the same tier', () => {
    const a1 = asg(cb1.id, 'ip', 'starter', 'DCL', 'cb');
    const a2 = asg(cb2.id, 'ip', 'starter', 'DCR', 'bpcb');
    const t = team([cb1, cb2], [a1, a2]);
    const moved = moveAssignment(t, a1.id, 'DCC').team;
    expect(starterOf(moved, 'ip', 'DCC')).toMatchObject({ playerId: cb1.id, role: 'cb' });
    const swapped = moveAssignment(t, a1.id, 'DCR').team;
    // Neither remembers a role in his new slot: both get the default.
    expect(starterOf(swapped, 'ip', 'DCR')).toMatchObject({ playerId: cb1.id, role: 'cb' });
    expect(starterOf(swapped, 'ip', 'DCL')).toMatchObject({ playerId: cb2.id, role: 'cb' });
  });

  it('replaces roles that do not fit the new position with its default', () => {
    const a1 = asg(cb1.id, 'ip', 'main', 'DCL', 'bpcb');
    const r = moveAssignment(withXI(['DCL', 'STC'], [cb1], [a1]), a1.id, 'STC').team;
    expect(mainOf(r, 'ip', 'STC')?.role).toBe('cf');
  });

  it('keeps a main sub main, for the same starter, when moved to a slot where nobody starts', () => {
    let t = withXI(['DCL'], [cb1]);
    t = assignPlayer(t, cb1.id, 'ip', 'DCL', 'main').team;
    const a = mainOf(t, 'ip', 'DCL')!;
    const starter = a.replaces;
    expect(starter).not.toBeNull();
    const r = moveAssignment(t, a.id, 'DMC').team;
    expect(mainOf(r, 'ip', 'DMC')).toMatchObject({ playerId: cb1.id, replaces: starter });
    expect(mainOf(r, 'oop', 'DCL')).toMatchObject({ playerId: cb1.id, replaces: starter }); // other phase untouched
    expect(invariantErrors(r)).toEqual([]);
  });

  it('moves aux subs freely but never onto a slot where the player is already assigned', () => {
    const aux = asg(cb1.id, 'ip', 'aux', 'DCL');
    const t = team([cb1], [aux, asg(cb1.id, 'ip', 'main', 'DCR')]);
    expect(moveAssignment(t, aux.id, 'DCR').team).toBe(t);
    expect(auxOf(moveAssignment(t, aux.id, 'DCC').team, 'ip', 'DCC')).toHaveLength(1);
  });

  it('is a no-op for the same slot or an unknown id', () => {
    const a1 = asg(cb1.id, 'ip', 'starter', 'DCL');
    const t = team([cb1], [a1]);
    expect(moveAssignment(t, a1.id, 'DCL').team).toBe(t);
    expect(moveAssignment(t, 'nope', 'DCR').team).toBe(t);
  });
});

describe('goalkeeper', () => {
  const gk1 = player('Iker', { GK: 'natural' });
  const gk2 = player('Jon', { GK: 'natural' });
  const outfielders = Array.from({ length: 10 }, (_, i) => player(`Out${i}`, { MC: 'natural' }));
  const outSlots: SlotId[] = ['DL', 'DCL', 'DCC', 'DCR', 'DR', 'MCL', 'MCC', 'MCR', 'STL', 'STR'];
  const tenOut = () => team([gk1, gk2, cb1, ...outfielders], outfielders.flatMap((p, i) =>
    (['ip', 'oop'] as Phase[]).map((ph) => asg(p.id, ph, 'starter', outSlots[i]))));

  it('keeps the 11th starter place for the goalkeeper', () => {
    const t = tenOut();
    expect(assignPlayer(t, cb1.id, 'ip', 'AMCC', 'starter')).toEqual({ team: t, error: 'outfieldFull' });
    const r = assignPlayer(t, gk1.id, 'ip', 'GK', 'starter').team;
    expect(startersCount(r, 'ip')).toBe(11);
    expect(starterOf(r, 'oop', 'GK')?.playerId).toBe(gk1.id);
    expect(invariantErrors(r)).toEqual([]);
  });

  it("won't move the goalkeeper out of goal when the outfield is full", () => {
    const r = assignPlayer(tenOut(), gk1.id, 'ip', 'GK', 'starter').team;
    expect(moveAssignment(r, starterOf(r, 'ip', 'GK')!.id, 'AMCC')).toEqual({ team: r, error: 'outfieldFull' });
    expect(assignPlayer(r, gk1.id, 'ip', 'AMCC', 'starter')).toEqual({ team: r, error: 'outfieldFull' });
  });

  it('has the same goalkeeper in both phases', () => {
    let t = team([gk1, gk2, cb1], [
      asg(gk1.id, 'ip', 'starter', 'GK'), asg(gk1.id, 'oop', 'starter', 'GK'),
      asg(cb1.id, 'ip', 'starter', 'DCL'), asg(cb1.id, 'oop', 'starter', 'DCR'),
    ]);
    // An outfield starter swapped into goal in one phase goes in goal in the other too.
    t = moveAssignment(t, starterOf(t, 'ip', 'DCL')!.id, 'GK').team;
    expect(starterOf(t, 'ip', 'GK')?.playerId).toBe(cb1.id);
    expect(starterOf(t, 'oop', 'GK')?.playerId).toBe(cb1.id);
    expect(starterOf(t, 'oop', 'DCR')?.playerId).toBe(gk1.id);
    expect(invariantErrors(t)).toEqual([]);
    // Moving him out of goal empties the goal in both phases; nobody is put in goal for him.
    t = moveAssignment(t, starterOf(t, 'ip', 'GK')!.id, 'DMC').team;
    expect(starterOf(t, 'ip', 'GK')).toBeUndefined();
    expect(starterOf(t, 'oop', 'GK')).toBeUndefined();
    expect(invariantErrors(t)).toEqual([]);
  });

  it('never puts a new outfield starter in goal in the other phase', () => {
    const r = assignPlayer(team([gk1, cb1]), cb1.id, 'ip', 'DCL', 'starter').team;
    expect(starterAssignment(r, cb1.id, 'oop')?.slot).toBe('DCL');
    const keeper = assignPlayer(team([gk1, cb1]), gk1.id, 'oop', 'GK', 'starter').team;
    expect(starterAssignment(keeper, gk1.id, 'ip')?.slot).toBe('GK');
  });

  it('links GK subs to the goalkeeper only, and outfield subs never to him', () => {
    const t = team([gk1, gk2, cb1, cb2], [
      asg(gk1.id, 'ip', 'starter', 'GK'), asg(gk1.id, 'oop', 'starter', 'GK'),
      asg(cb1.id, 'ip', 'starter', 'DCL'), asg(cb1.id, 'oop', 'starter', 'DCL'),
    ]);
    const r = assignPlayer(t, gk2.id, 'ip', 'GK', 'main').team;
    expect(mainOf(r, 'ip', 'GK')?.replaces).toBe(gk1.id);
    expect(mainOf(r, 'oop', 'GK')).toMatchObject({ playerId: gk2.id, replaces: gk1.id });
    const aux = assignPlayer(t, cb2.id, 'ip', 'DCL', 'aux').team;
    const a = auxOf(aux, 'ip', 'DCL')[0];
    expect(a.replaces).toBe(cb1.id);
    expect(setReplaces(aux, a.id, gk1.id)).toBe(aux);
    // Moving a sub into goal links him to the goalkeeper; out of goal, the link no longer works
    // and falls back to the starter of his new slot (nobody at DMC).
    const inGoal = moveAssignment(aux, a.id, 'GK').team;
    expect(auxOf(inGoal, 'ip', 'GK')[0].replaces).toBe(gk1.id);
    const out = moveAssignment(inGoal, a.id, 'DMC').team;
    expect(auxOf(out, 'ip', 'DMC')[0].replaces).toBeNull();
    expect(invariantErrors(out)).toEqual([]);
  });

  it('leaves the GK sub empty when nobody is in goal', () => {
    const t = team([gk2, cb1], [asg(cb1.id, 'ip', 'starter', 'DCL'), asg(cb1.id, 'oop', 'starter', 'DCL')]);
    const r = assignPlayer(t, gk2.id, 'ip', 'GK', 'aux').team;
    expect(auxOf(r, 'ip', 'GK')[0].replaces).toBeNull();
    expect(invariantErrors(r)).toEqual([]);
  });

  it('fixes older data: 11 outfield starters and a different goalkeeper per phase', () => {
    const eleven = [...outfielders, cb1];
    const slots: SlotId[] = [...outSlots, 'AMCC'];
    const t = team([gk1, gk2, ...eleven], [
      ...eleven.flatMap((p, i) => (['ip', 'oop'] as Phase[]).map((ph) => asg(p.id, ph, 'starter', slots[i]))),
    ]);
    const r = linkLineup(t);
    expect(outfieldCount(r, 'ip')).toBe(10);
    expect(invariantErrors(r)).toEqual([]);
    const keepers = team([gk1, gk2, cb1], [
      asg(gk1.id, 'ip', 'starter', 'GK'), asg(gk1.id, 'oop', 'starter', 'DCL'),
      asg(gk2.id, 'ip', 'starter', 'DCR'), asg(gk2.id, 'oop', 'starter', 'GK'),
    ]);
    const fixed = linkLineup(keepers);
    expect(starterOf(fixed, 'oop', 'GK')?.playerId).toBe(gk1.id);
    expect(invariantErrors(fixed)).toEqual([]);
  });
});

describe('sub links (who a sub replaces)', () => {
  const mc = player('Eva', { MC: 'natural', AMC: 'competent' });
  const amr = player('Fede', { AMR: 'natural' });
  // XI pieces: cb1 at DCL, mc at MCC, amr at AMR, st at STC (same slots in both phases).
  const xi = () => team([cb1, cb2, cb3, st, mc, amr], (['ip', 'oop'] as Phase[]).flatMap((ph) => [
    asg(cb1.id, ph, 'starter', 'DCL'), asg(mc.id, ph, 'starter', 'MCC'),
    asg(amr.id, ph, 'starter', 'AMR'), asg(st.id, ph, 'starter', 'STC'),
  ]));

  it("links a new sub to the starter of the slot he's placed in; an aux sub elsewhere replaces nobody", () => {
    const t = xi();
    expect(mainOf(assignPlayer(t, cb2.id, 'ip', 'DCL', 'main').team, 'ip', 'DCL')?.replaces).toBe(cb1.id);
    expect(auxOf(assignPlayer(t, cb2.id, 'ip', 'DCL', 'aux').team, 'ip', 'DCL')[0].replaces).toBe(cb1.id);
    expect(auxOf(assignPlayer(t, cb2.id, 'ip', 'DCR', 'aux').team, 'ip', 'DCR')[0].replaces).toBeNull();
  });

  it('lets an aux sub replace nobody, but not a main sub', () => {
    let t = assignPlayer(xi(), cb2.id, 'ip', 'DCL', 'aux').team;
    t = assignPlayer(t, cb3.id, 'ip', 'MCC', 'main').team;
    const aux = auxOf(t, 'ip', 'DCL')[0];
    const main = mainOf(t, 'ip', 'MCC')!;
    expect(auxOf(setReplaces(t, aux.id, null), 'ip', 'DCL')[0].replaces).toBeNull();
    expect(setReplaces(t, main.id, null)).toBe(t);
    // A chosen "nobody" stays after other changes.
    const later = assignPlayer(setReplaces(t, aux.id, null), cb3.id, 'ip', 'AMR', 'aux').team;
    expect(auxOf(later, 'ip', 'DCL')[0].replaces).toBeNull();
  });

  it('links the main sub in the other phase to the same starter, where that starter plays', () => {
    const t = xi();
    const moved = moveAssignment(t, starterOf(t, 'oop', 'AMR')!.id, 'MR').team;
    const r = assignPlayer(moved, cb2.id, 'ip', 'AMR', 'main').team;
    expect(mainOf(r, 'oop', 'MR')).toMatchObject({ playerId: cb2.id, replaces: amr.id });
    expect(invariantErrors(r)).toEqual([]);
  });

  it('keeps the link when a sub is moved to play in another position', () => {
    const t = assignPlayer(xi(), cb2.id, 'ip', 'AMR', 'main').team;
    const r = moveAssignment(t, mainOf(t, 'ip', 'AMR')!.id, 'MCC').team;
    expect(mainOf(r, 'ip', 'MCC')).toMatchObject({ playerId: cb2.id, replaces: amr.id });
  });

  it('keeps one main sub per starter: the newest wins, the other is relinked to a free starter', () => {
    // cb2 replaces amr but plays in MCC; then cb3 is placed as amr's main sub in AMR.
    let t = assignPlayer(xi(), cb2.id, 'ip', 'AMR', 'main').team;
    t = moveAssignment(t, mainOf(t, 'ip', 'AMR')!.id, 'MCC').team;
    t = assignPlayer(t, cb3.id, 'ip', 'AMR', 'main').team;
    expect(mainOf(t, 'ip', 'AMR')?.replaces).toBe(amr.id);
    expect(mainOf(t, 'ip', 'MCC')?.replaces).toBe(mc.id); // nearest starter without a main sub
    expect(invariantErrors(t)).toEqual([]);
  });

  it('sets who a sub replaces, in both phases for a main sub', () => {
    const t = assignPlayer(xi(), cb2.id, 'ip', 'MCC', 'main').team;
    const a = mainOf(t, 'ip', 'MCC')!;
    const before = snapshot(t);
    const r = setReplaces(t, a.id, amr.id);
    expect(mainOf(r, 'ip', 'MCC')?.replaces).toBe(amr.id);
    expect(r.assignments.find((x) => x.phase === 'oop' && x.playerId === cb2.id)?.replaces).toBe(amr.id);
    expect(t).toEqual(before);
    expect(setReplaces(t, a.id, mc.id)).toBe(t);
    expect(setReplaces(t, a.id, cb2.id)).toBe(t); // himself
    expect(setReplaces(t, a.id, cb3.id)).toBe(t); // doesn't start
    expect(invariantErrors(r)).toEqual([]);
  });

  it("passes a replaced starter's subs to the player who replaces him", () => {
    let t = assignPlayer(xi(), cb2.id, 'ip', 'DCL', 'main').team;
    t = assignPlayer(t, cb3.id, 'oop', 'DCL', 'aux').team;
    const newcomer = player('Hans', { DC: 'natural' });
    // The newcomer replaces cb1 in possession, and the change is mirrored out of possession.
    const r = assignPlayer({ ...t, players: [...t.players, newcomer] }, newcomer.id, 'ip', 'DCL', 'starter').team;
    expect(mainOf(r, 'ip', 'DCL')?.replaces).toBe(newcomer.id);
    expect(auxOf(r, 'oop', 'DCL')[0].replaces).toBe(newcomer.id);
    expect(invariantErrors(r)).toEqual([]);
  });

  it('leaves the aux subs of a removed starter replacing nobody', () => {
    const t = assignPlayer(xi(), cb2.id, 'ip', 'DCL', 'aux').team;
    const r = removeAssignment(t, starterOf(t, 'ip', 'DCL')!.id);
    expect(auxOf(r, 'ip', 'DCL')[0].replaces).toBeNull();
    expect(invariantErrors(r)).toEqual([]);
  });
});

describe('roles', () => {
  const roleOf = (t: ReturnType<typeof team>, pid: string) => t.players.find((p) => p.id === pid)?.roles;

  it('gives a newly placed player the FM26 default role of the position, in every tier', () => {
    const t = withXI(['DMC'], [cb1, cb2, st]);
    expect(starterOf(assignPlayer(t, cb1.id, 'ip', 'DCL', 'starter').team, 'ip', 'DCL')?.role).toBe('cb');
    expect(mainOf(assignPlayer(t, cb1.id, 'oop', 'DMC', 'main').team, 'oop', 'DMC')?.role).toBe('dm');
    expect(auxOf(assignPlayer(t, st.id, 'ip', 'STC', 'aux').team, 'ip', 'STC')[0].role).toBe('cf');
  });

  it('remembers the role of every slot and phase a player is put in', () => {
    const r = assignPlayer(team([cb1]), cb1.id, 'ip', 'DCL', 'starter').team;
    expect(roleOf(r, cb1.id)).toEqual({ ip: { DCL: 'cb' }, oop: { DCL: 'cb' } });
    const changed = setRole(r, starterOf(r, 'ip', 'DCL')!.id, 'bpcb');
    expect(roleOf(changed, cb1.id)).toEqual({ ip: { DCL: 'bpcb' }, oop: { DCL: 'cb' } });
    const moved = assignPlayer(changed, cb1.id, 'oop', 'DMC', 'aux').team;
    expect(roleOf(moved, cb1.id)).toEqual({ ip: { DCL: 'bpcb' }, oop: { DCL: 'cb', DMC: 'dm' } });
  });

  it('puts a player back in a slot with his remembered role, in any tier', () => {
    let t = assignPlayer(team([cb1]), cb1.id, 'ip', 'DCL', 'starter').team;
    t = setRole(t, starterOf(t, 'ip', 'DCL')!.id, 'bpcb');
    t = removeAssignment(t, starterOf(t, 'ip', 'DCL')!.id);
    t = assignPlayer(t, cb1.id, 'ip', 'DCL', 'aux').team;
    expect(auxOf(t, 'ip', 'DCL')[0].role).toBe('bpcb');
  });

  it("doesn't carry a role to another slot of the same position", () => {
    const a1 = asg(cb1.id, 'ip', 'starter', 'DCL', 'bpcb');
    const t = team([{ ...cb1, roles: { ip: { DCL: 'bpcb' } } }], [a1]);
    expect(starterOf(moveAssignment(t, a1.id, 'DCR').team, 'ip', 'DCR')?.role).toBe('cb');
    expect(starterOf(assignPlayer(t, cb1.id, 'ip', 'DCC', 'starter').team, 'ip', 'DCC')?.role).toBe('cb');
    expect(auxOf(assignPlayer(t, cb1.id, 'ip', 'DCR', 'aux').team, 'ip', 'DCR')[0].role).toBe('cb');
    // Back to DCL: the remembered role returns.
    const back = moveAssignment(moveAssignment(t, a1.id, 'DCR').team, a1.id, 'DCL').team;
    expect(starterOf(back, 'ip', 'DCL')?.role).toBe('bpcb');
  });

  it("uses the incoming player's remembered role, else the default, never the replaced player's", () => {
    const remembering = { ...cb2, roles: { ip: { DCL: 'nncb' } } };
    const t = team([cb1, remembering, cb3], [asg(cb1.id, 'ip', 'starter', 'DCL', 'bpcb')]);
    expect(starterOf(assignPlayer(t, cb2.id, 'ip', 'DCL', 'starter').team, 'ip', 'DCL')?.role).toBe('nncb');
    expect(starterOf(assignPlayer(t, cb3.id, 'ip', 'DCL', 'starter').team, 'ip', 'DCL')?.role).toBe('cb');
  });

  it('forgets the role of a slot when it is cleared', () => {
    const a1 = asg(cb1.id, 'ip', 'starter', 'DCL', 'cb');
    const t = team([{ ...cb1, roles: { ip: { DCL: 'cb' } } }], [a1]);
    const r = setRole(t, a1.id, null);
    expect(starterOf(r, 'ip', 'DCL')?.role).toBeNull();
    expect(roleOf(r, cb1.id)).toEqual({ ip: {} });
  });

  it("doesn't mutate its input and returns the same team for a no-op setRole", () => {
    const a1 = asg(cb1.id, 'ip', 'starter', 'DCL', 'cb');
    const t = team([{ ...cb1, roles: { ip: { DCL: 'cb' } } }, cb2], [a1]);
    const before = snapshot(t);
    setRole(t, a1.id, 'bpcb');
    assignPlayer(t, cb2.id, 'ip', 'DCL', 'starter');
    moveAssignment(t, a1.id, 'DMC');
    expect(t).toEqual(before);
    expect(setRole(t, a1.id, 'cb')).toBe(t);
    expect(setRole(t, 'nope', 'cb')).toBe(t);
  });
});

describe('other commands', () => {
  it('removes an assignment and sets a role', () => {
    const a1 = asg(cb1.id, 'ip', 'starter', 'DCL');
    const t = team([cb1], [a1]);
    expect(setRole(t, a1.id, 'cb').assignments[0].role).toBe('cb');
    expect(setRole(t, a1.id, null).assignments[0].role).toBeNull();
    expect(removeAssignment(t, a1.id).assignments).toHaveLength(0);
  });

  it('promotes an aux sub to main and demotes the previous main sub', () => {
    const main = asg(cb1.id, 'ip', 'main', 'DCL');
    const aux = asg(cb2.id, 'ip', 'aux', 'DCL');
    const r = promoteToMain(withXI(['DCL'], [cb1, cb2], [main, aux]), aux.id);
    expect(mainOf(r, 'ip', 'DCL')?.playerId).toBe(cb2.id);
    expect(auxOf(r, 'ip', 'DCL').map((a) => a.playerId)).toEqual([cb1.id]);
  });

  it('ignores promote for non-aux assignments', () => {
    const main = asg(cb1.id, 'ip', 'main', 'DCL');
    const t = team([cb1], [main]);
    expect(promoteToMain(t, main.id)).toBe(t);
  });

  it('adds and updates players', () => {
    let t = team([]);
    t = upsertPlayer(t, cb1);
    expect(t.players).toHaveLength(1);
    t = upsertPlayer(t, { ...cb1, name: 'Ana María' });
    expect(t.players).toHaveLength(1);
    expect(t.players[0].name).toBe('Ana María');
  });

  it('removes a player together with all his assignments', () => {
    const t = team([cb1, cb2], [
      asg(cb1.id, 'ip', 'starter', 'DCL'),
      asg(cb1.id, 'oop', 'aux', 'DCR'),
      asg(cb2.id, 'ip', 'starter', 'DCR'),
    ]);
    const r = removePlayer(t, cb1.id);
    expect(r.players.map((p) => p.id)).toEqual([cb2.id]);
    expect(r.assignments.every((a) => a.playerId === cb2.id)).toBe(true);
  });

  it('copies a team with new ids, keeping players, lineups, roles and sub links', () => {
    const src = sampleTeam('Original');
    const before = snapshot(src);
    const copy = copyTeam(src, 'Copy');
    expect(src).toEqual(before);
    expect(copy.name).toBe('Copy');
    expect(copy.id).not.toBe(src.id);
    expect(copy.players).toHaveLength(src.players.length);
    expect(invariantErrors(copy)).toEqual([]);
    const srcIds = new Set([...src.players.map((p) => p.id), ...src.assignments.map((a) => a.id)]);
    expect([...copy.players, ...copy.assignments].some((x) => srcIds.has(x.id))).toBe(false);
    // Same lineup, read through the new ids.
    const describe = (t: Team) => {
      const name = (id: string | null) => t.players.find((p) => p.id === id)?.name ?? null;
      return t.assignments.map((a) => [name(a.playerId), a.phase, a.tier, a.slot, a.role, name(a.replaces)]);
    };
    expect(describe(copy)).toEqual(describe(src));
    expect(copy.players.map((p) => p.roles)).toEqual(src.players.map((p) => p.roles));
    // Editing the copy leaves the original alone.
    const edited = removePlayer(copy, copy.players[0].id);
    expect(edited.players).toHaveLength(src.players.length - 1);
    expect(src).toEqual(before);
  });

  it('creates empty teams and unique ids', () => {
    const t = emptyTeam('Nuevo');
    expect(t).toMatchObject({ name: 'Nuevo', players: [], assignments: [] });
    const ids = new Set(Array.from({ length: 500 }, uid));
    expect(ids.size).toBe(500);
  });
});

describe('transfer targets', () => {
  const target = (name: string, slot: SlotId | null = null): Player => ({ ...player(name, { DC: 'natural' }), target: { slots: { ip: slot, oop: slot } } });
  /** Ana starts at DCL and Bea is her main sub, in both phases, each with her own roles. */
  function lineup(tgt: Player) {
    const ana = { ...cb1, roles: { ip: { DCL: 'bpcb' }, oop: { DCL: 'ccb' } } };
    const bea = { ...cb2, roles: { ip: { DCL: 'nncb' }, oop: { DCL: 'scb' } } };
    return team([ana, bea, tgt], [
      asg(ana.id, 'ip', 'starter', 'DCL', 'bpcb'),
      asg(ana.id, 'oop', 'starter', 'DCL', 'ccb'),
      asg(bea.id, 'ip', 'main', 'DCL', 'nncb', ana.id),
      asg(bea.id, 'oop', 'main', 'DCL', 'scb', ana.id),
    ]);
  }
  const at = (t: Team, phase: Phase, tier: Tier) =>
    t.assignments.filter((a) => a.phase === phase && a.slot === 'DCL' && a.tier === tier).map((a) => [a.playerId, a.role, a.replaces]);

  it('keeps targets out of the lineup', () => {
    const t = team([target('Tom')]);
    expect(assignPlayer(t, 'p-Tom', 'ip', 'DCL', 'starter').team).toBe(t);
    expect(assignPlayer(t, 'p-Tom', 'ip', 'DCL', 'aux').team).toBe(t);
    const dirty = team([target('Tom')], [asg('p-Tom', 'ip', 'aux', 'DCL')]);
    expect(linkLineup(dirty).assignments).toEqual([]);
  });

  it('plans a slot with the remembered role, else the default, in each phase', () => {
    const t = team([{ ...target('Tom'), roles: { ip: { DCL: 'wcb' } } }]);
    const before = snapshot(t);
    const r = planTarget(t, 'p-Tom', 'ip', 'DCL');
    expect(t).toEqual(before);
    expect(r.players[0].target).toEqual({ slots: { ip: 'DCL', oop: 'DCL' } });
    expect(r.players[0].roles).toEqual({ ip: { DCL: 'wcb' }, oop: { DCL: 'cb' } });
    expect(r.assignments).toEqual([]);
    expect(planTarget(r, 'p-Tom', 'ip', 'DCL')).toBe(r);
    expect(planTarget(team([cb1]), cb1.id, 'ip', 'DCL').players[0].target).toBeUndefined();
    expect(planTarget(r, 'p-Tom', 'ip', null).players[0].target).toEqual({ slots: { ip: null, oop: 'DCL' } });
  });

  it('sets the planned role per phase', () => {
    const t = planTarget(team([target('Tom')]), 'p-Tom', 'ip', 'DCL');
    const r = setTargetRole(t, 'p-Tom', 'oop', 'scb');
    expect(r.players[0].roles?.oop?.DCL).toBe('scb');
    expect(r.players[0].roles?.ip?.DCL).toBe('cb');
    expect(setTargetRole(r, 'p-Tom', 'oop', 'scb')).toBe(r);
    expect(setTargetRole(team([target('Tom')]), 'p-Tom', 'ip', 'cb').players[0].roles).toBeUndefined();
  });

  it('signs as starter: the starter becomes main sub and the main sub aux, all keeping slots and roles', () => {
    const t = setTargetRole(planTarget(lineup(target('Tom')), 'p-Tom', 'ip', 'DCL'), 'p-Tom', 'ip', 'wcb');
    const before = snapshot(t);
    const { team: r, error } = signTarget(t, 'p-Tom', 'starter', 'ip');
    expect(error).toBeUndefined();
    expect(t).toEqual(before);
    expect(r.players.find((p) => p.id === 'p-Tom')?.target).toBeUndefined();
    expect(at(r, 'ip', 'starter')).toEqual([['p-Tom', 'wcb', null]]);
    expect(at(r, 'oop', 'starter')).toEqual([['p-Tom', 'cb', null]]);
    expect(at(r, 'ip', 'main')).toEqual([[cb1.id, 'bpcb', 'p-Tom']]);
    expect(at(r, 'oop', 'main')).toEqual([[cb1.id, 'ccb', 'p-Tom']]);
    expect(at(r, 'ip', 'aux')).toEqual([[cb2.id, 'nncb', 'p-Tom']]);
    expect(at(r, 'oop', 'aux')).toEqual([[cb2.id, 'scb', 'p-Tom']]);
    expect(invariantErrors(r)).toEqual([]);
  });

  it('keeps the replaced starter\'s role even if it was never remembered', () => {
    const t = planTarget(team([cb1, target('Tom')], [
      asg(cb1.id, 'ip', 'starter', 'DCL', 'bpcb'),
      asg(cb1.id, 'oop', 'starter', 'DCL', 'ccb'),
    ]), 'p-Tom', 'ip', 'DCL');
    const r = signTarget(t, 'p-Tom', 'starter', 'ip').team;
    expect(at(r, 'ip', 'main')).toEqual([[cb1.id, 'bpcb', 'p-Tom']]);
    expect(at(r, 'oop', 'main')).toEqual([[cb1.id, 'ccb', 'p-Tom']]);
  });

  it('signs as sub: he becomes main sub and the main sub aux', () => {
    const t = planTarget(lineup(target('Tom')), 'p-Tom', 'ip', 'DCL');
    const r = signTarget(t, 'p-Tom', 'sub', 'oop').team;
    for (const ph of ['ip', 'oop'] as Phase[]) {
      expect(at(r, ph, 'starter').map((x) => x[0])).toEqual([cb1.id]);
      expect(at(r, ph, 'main')).toEqual([['p-Tom', 'cb', cb1.id]]);
      expect(at(r, ph, 'aux').map((x) => x[0])).toEqual([cb2.id]);
    }
    expect(invariantErrors(r)).toEqual([]);
  });

  it('signs into an empty slot, or without a plan into the squad only', () => {
    const planned = planTarget(team([target('Tom')]), 'p-Tom', 'ip', 'DCL');
    expect(at(signTarget(planned, 'p-Tom', 'starter', 'ip').team, 'oop', 'starter').map((x) => x[0])).toEqual(['p-Tom']);
    // No starter there: a sub can only be auxiliary.
    expect(at(signTarget(planned, 'p-Tom', 'sub', 'ip').team, 'ip', 'aux').map((x) => x[0])).toEqual(['p-Tom']);
    const free = signTarget(team([target('Tom')]), 'p-Tom', 'starter', 'ip').team;
    expect(free.players[0].target).toBeUndefined();
    expect(free.assignments).toEqual([]);
    expect(signTarget(team([cb1]), cb1.id, 'starter', 'ip').team.players[0]).toEqual(cb1);
  });

  it('fails without changes when the XI has no room', () => {
    const outfield = SLOTS.filter((s) => s.id !== 'GK' && s.id !== 'DCL').slice(0, 10).map((s) => s.id);
    const t = planTarget(withXI(outfield, [target('Tom')]), 'p-Tom', 'ip', 'DCL');
    const r = signTarget(t, 'p-Tom', 'starter', 'ip');
    expect(r.error).toBe('outfieldFull');
    expect(r.team).toBe(t);
  });

  it('copies targets with the team', () => {
    const t = planTarget(team([target('Tom')]), 'p-Tom', 'ip', 'DCL');
    expect(copyTeam(t, 'Copy').players[0].target).toEqual({ slots: { ip: 'DCL', oop: 'DCL' } });
  });

  it('plans a different slot per phase, each with its own role', () => {
    let t = planTarget(team([target('Tom')]), 'p-Tom', 'ip', 'DCL');
    t = planTarget(t, 'p-Tom', 'oop', 'DMC');
    expect(t.players[0].target).toEqual({ slots: { ip: 'DCL', oop: 'DMC' } });
    expect(t.players[0].roles).toEqual({ ip: { DCL: 'cb' }, oop: { DCL: 'cb', DMC: 'dm' } });
    expect(setTargetRole(t, 'p-Tom', 'oop', 'sdm').players[0].roles?.oop?.DMC).toBe('sdm');
  });

  /** Ana starts at DCL and Dani at STC in both phases; Tom is planned at DCL (IP) and STC (OOP). */
  function split() {
    const t = team([cb1, st, target('Tom')], [
      asg(cb1.id, 'ip', 'starter', 'DCL', 'bpcb'), asg(cb1.id, 'oop', 'starter', 'DCL', 'ccb'),
      asg(st.id, 'ip', 'starter', 'STC', 'p'), asg(st.id, 'oop', 'starter', 'STC', 'cf'),
    ]);
    return planTarget(planTarget(t, 'p-Tom', 'ip', 'DCL'), 'p-Tom', 'oop', 'STC');
  }
  const slotOf = (t: Team, id: string, ph: Phase, tier: Tier) =>
    t.assignments.filter((a) => a.playerId === id && a.phase === ph && a.tier === tier).map((a) => a.slot);

  it('signs as starter like promoting a main sub: nobody else changes position', () => {
    // OOP plan STC is taken by Dani: Tom takes Ana's OOP slot instead of pushing Dani out.
    const r = signTarget(split(), 'p-Tom', 'starter', 'ip').team;
    expect(slotOf(r, 'p-Tom', 'ip', 'starter')).toEqual(['DCL']);
    expect(slotOf(r, 'p-Tom', 'oop', 'starter')).toEqual(['DCL']);
    expect(slotOf(r, st.id, 'ip', 'starter')).toEqual(['STC']);
    expect(slotOf(r, st.id, 'oop', 'starter')).toEqual(['STC']);
    expect(at(r, 'ip', 'main')).toEqual([[cb1.id, 'bpcb', 'p-Tom']]);
    expect(at(r, 'oop', 'main')).toEqual([[cb1.id, 'ccb', 'p-Tom']]);
    expect(invariantErrors(r)).toEqual([]);
  });

  it('signs as starter into a different free slot per phase, the starter staying in his own slots as main sub', () => {
    // Tom: DCL (IP, Ana's slot) and DMC (OOP, free). Ana becomes his main sub at DCL in both phases.
    const t = planTarget(split(), 'p-Tom', 'oop', 'DMC');
    const r = signTarget(t, 'p-Tom', 'starter', 'ip').team;
    expect(slotOf(r, 'p-Tom', 'oop', 'starter')).toEqual(['DMC']);
    expect(slotOf(r, cb1.id, 'oop', 'main')).toEqual(['DCL']);
    expect(mainOf(r, 'oop', 'DCL')).toMatchObject({ playerId: cb1.id, role: 'ccb', replaces: 'p-Tom' });
    expect(starterOf(r, 'oop', 'DCL')).toBeUndefined();
    expect(slotOf(r, st.id, 'oop', 'starter')).toEqual(['STC']);
    expect(invariantErrors(r)).toEqual([]);
  });

  it('signs as starter from the phase whose planned slot has a starter to replace', () => {
    // OOP plan DMC is empty there: signing from the OOP view still replaces Ana (IP, DCL).
    const t = planTarget(split(), 'p-Tom', 'oop', 'DMC');
    const r = signTarget(t, 'p-Tom', 'starter', 'oop');
    expect(r.error).toBeUndefined();
    expect(slotOf(r.team, 'p-Tom', 'ip', 'starter')).toEqual(['DCL']);
    expect(slotOf(r.team, 'p-Tom', 'oop', 'starter')).toEqual(['DMC']);
    expect(isStarter(r.team, cb1.id, 'oop')).toBe(false);
    expect(invariantErrors(r.team)).toEqual([]);
  });

  it('signs as sub covering each phase\'s planned starter', () => {
    const r = signTarget(split(), 'p-Tom', 'sub', 'oop').team;
    expect(r.assignments.filter((a) => a.playerId === 'p-Tom').map((a) => [a.phase, a.tier, a.slot, a.replaces]).sort()).toEqual([
      ['ip', 'main', 'DCL', cb1.id],
      ['oop', 'main', 'STC', st.id],
    ]);
    expect(invariantErrors(r)).toEqual([]);
  });
});

describe('promoteToStarter', () => {
  /** Ana starts at DCL, Bea is her main sub and Cris an aux sub there, in both phases. */
  function bench() {
    return team([cb1, cb2, cb3], [
      asg(cb1.id, 'ip', 'starter', 'DCL', 'bpcb'), asg(cb1.id, 'oop', 'starter', 'DCL', 'ccb'),
      asg(cb2.id, 'ip', 'main', 'DCL', 'nncb', cb1.id), asg(cb2.id, 'oop', 'main', 'DCL', 'scb', cb1.id),
      asg(cb3.id, 'ip', 'aux', 'DCL', 'cb', cb1.id), asg(cb3.id, 'oop', 'aux', 'DCL', 'cb', cb1.id),
    ]);
  }
  const tiers = (t: Team) =>
    t.assignments.filter((a) => a.slot === 'DCL').map((a) => [a.playerId, a.phase, a.tier, a.role]).sort();

  it('makes a main sub the starter and the starter his main sub, keeping roles', () => {
    const t = bench();
    const before = snapshot(t);
    const r = promoteToStarter(t, t.assignments[2].id).team;
    expect(t).toEqual(before);
    expect(tiers(r)).toEqual([
      [cb1.id, 'ip', 'main', 'bpcb'], [cb1.id, 'oop', 'main', 'ccb'],
      [cb2.id, 'ip', 'starter', 'nncb'], [cb2.id, 'oop', 'starter', 'scb'],
      [cb3.id, 'ip', 'aux', 'cb'], [cb3.id, 'oop', 'aux', 'cb'],
    ].sort());
    expect(invariantErrors(r)).toEqual([]);
  });

  it('swaps tiers in place: B (main sub at DCC) starts at DCC, A (starter at DR) becomes main sub at DR', () => {
    const a = player('A', { DR: 'natural' });
    const b = player('B', { DC: 'natural' });
    const t = team([a, b], (['ip', 'oop'] as Phase[]).flatMap((ph) => [
      asg(a.id, ph, 'starter', 'DR', ph === 'ip' ? 'iwb' : 'fb'),
      asg(b.id, ph, 'main', 'DCC', ph === 'ip' ? 'bpcb' : 'scb', a.id),
    ]));
    const before = snapshot(t);
    const r = promoteToStarter(t, t.assignments[1].id).team;
    expect(t).toEqual(before);
    for (const ph of ['ip', 'oop'] as Phase[]) {
      expect(starterOf(r, ph, 'DCC')).toMatchObject({ playerId: b.id, role: ph === 'ip' ? 'bpcb' : 'scb' });
      expect(mainOf(r, ph, 'DR')).toMatchObject({ playerId: a.id, role: ph === 'ip' ? 'iwb' : 'fb', replaces: b.id });
      expect(starterOf(r, ph, 'DR')).toBeUndefined();
      expect(startersCount(r, ph)).toBe(1);
    }
    expect(invariantErrors(r)).toEqual([]);
  });

  it('swaps in each phase\'s own slots when they differ between phases', () => {
    const a = player('A', { DR: 'natural', WBR: 'natural' });
    const b = player('B', { DC: 'natural', DM: 'natural' });
    const t = team([a, b], [
      asg(a.id, 'ip', 'starter', 'DR', 'iwb'), asg(a.id, 'oop', 'starter', 'WBR', 'hwb'),
      asg(b.id, 'ip', 'main', 'DCC', 'bpcb', a.id), asg(b.id, 'oop', 'main', 'DMC', 'sdm', a.id),
    ]);
    const r = promoteToStarter(t, t.assignments[3].id).team;
    expect(starterOf(r, 'ip', 'DCC')?.playerId).toBe(b.id);
    expect(starterOf(r, 'oop', 'DMC')?.playerId).toBe(b.id);
    expect(mainOf(r, 'ip', 'DR')).toMatchObject({ playerId: a.id, role: 'iwb' });
    expect(mainOf(r, 'oop', 'WBR')).toMatchObject({ playerId: a.id, role: 'hwb' });
    expect(invariantErrors(r)).toEqual([]);
  });

  it('drops a main sub already in the starter\'s slot (covering someone else) to aux', () => {
    const a = player('A', { DR: 'natural' });
    const b = player('B', { DC: 'natural' });
    const c = player('C', { DR: 'natural' });
    const t = team([a, b, c, cb1], (['ip', 'oop'] as Phase[]).flatMap((ph) => [
      asg(a.id, ph, 'starter', 'DR', 'fb'),
      asg(cb1.id, ph, 'starter', 'DCL', 'cb'),
      asg(b.id, ph, 'main', 'DCC', 'cb', a.id),
      asg(c.id, ph, 'main', 'DR', ph === 'ip' ? 'wb' : 'pfb', cb1.id),
    ]));
    const r = promoteToStarter(t, t.assignments[2].id).team;
    for (const ph of ['ip', 'oop'] as Phase[]) {
      expect(mainOf(r, ph, 'DR')?.playerId).toBe(a.id);
      expect(auxOf(r, ph, 'DR').map((x) => [x.playerId, x.role])).toEqual([[c.id, ph === 'ip' ? 'wb' : 'pfb']]);
    }
    expect(invariantErrors(r)).toEqual([]);
  });

  it('does not promote auxiliary subs to starter', () => {
    const t = bench();
    expect(promoteToStarter(t, t.assignments[4].id).team).toBe(t);
  });

  it('keeps every other starter where he was', () => {
    const src = sampleTeam('Promote');
    const starts = (t: Team, skip: string[]) =>
      t.assignments.filter((a) => a.tier === 'starter' && !skip.includes(a.playerId)).map((a) => [a.playerId, a.phase, a.slot]).sort();
    const mains = src.assignments.filter((a) => a.tier === 'main' && a.replaces);
    expect(mains.length).toBeGreaterThan(0);
    for (const sub of mains) {
      const r = promoteToStarter(src, sub.id);
      expect(r.error).toBeUndefined();
      expect(invariantErrors(r.team)).toEqual([]);
      expect(startersCount(r.team, sub.phase)).toBe(startersCount(src, sub.phase));
      expect(starts(r.team, [sub.playerId, sub.replaces!])).toEqual(starts(src, [sub.playerId, sub.replaces!]));
    }
  });

  it('ignores starters and fails without changes when the XI is full', () => {
    const t = bench();
    expect(promoteToStarter(t, t.assignments[0].id).team).toBe(t);
    const outfield = SLOTS.filter((s) => s.id !== 'GK' && s.id !== 'DCR').slice(0, 10).map((s) => s.id);
    const full = withXI(outfield, [cb2], [asg(cb2.id, 'ip', 'main', 'DCR')]);
    const r = promoteToStarter(full, full.assignments.at(-1)!.id);
    expect(r.error).toBe('outfieldFull');
    expect(r.team).toBe(full);
  });
});

describe('lineup rules hold under random edits', () => {
  it('never breaks the invariants', () => {
    const rand = rng(42);
    const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];
    const slots = SLOTS.map((s) => s.id as SlotId);
    const tiers: Tier[] = ['starter', 'main', 'aux'];
    const phases: Phase[] = ['ip', 'oop'];
    let t = sampleTeam('Fuzz');
    expect(invariantErrors(t)).toEqual([]);

    for (let i = 0; i < 2000; i++) {
      const op = rand();
      if (op < 0.55) {
        t = assignPlayer(t, pick(t.players).id, pick(phases), pick(slots), pick(tiers)).team;
      } else if (op < 0.8 && t.assignments.length) {
        t = moveAssignment(t, pick(t.assignments).id, pick(slots)).team;
      } else if (op < 0.85 && t.assignments.length) {
        t = promoteToMain(t, pick(t.assignments).id);
      } else if (op < 0.88 && t.assignments.length) {
        t = setReplaces(t, pick(t.assignments).id, pick(t.players).id);
      } else if (op < 0.92 && t.assignments.length) {
        t = removeAssignment(t, pick(t.assignments).id);
      } else if (op < 0.94) {
        t = upsertPlayer(t, { ...player(`T${i}`, { DC: 'natural', MC: 'competent' }), target: { slots: { ip: null, oop: null } } });
      } else if (op < 0.97) {
        t = planTarget(t, pick(t.players).id, pick(phases), rand() < 0.1 ? null : pick(slots));
      } else if (op < 0.985) {
        t = signTarget(t, pick(t.players).id, rand() < 0.5 ? 'starter' : 'sub', pick(phases)).team;
      } else if (t.assignments.length) {
        t = promoteToStarter(t, pick(t.assignments).id).team;
      }
      const errors = invariantErrors(t);
      if (errors.length) throw new Error(`step ${i}: ${errors.join('; ')}`);
    }
  });
});
