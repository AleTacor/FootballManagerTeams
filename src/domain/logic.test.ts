import { describe, expect, it } from 'vitest';
import { sampleTeam } from '../data/sample';
import { asg, invariantErrors, player, rng, snapshot, team } from '../test/helpers';
import {
  assignPlayer, auxOf, canPlay, emptyTeam, familiarityAt, isStarter, mainOf, MAX_STARTERS,
  moveAssignment, promoteToMain, removeAssignment, removePlayer, setRole, sortByFamiliarity,
  starterAssignment, starterOf, startersCount, uid, unplacedStarters, upsertPlayer,
} from './logic';
import { SLOTS } from './positions';
import type { Phase, SlotId, Tier } from './types';

const cb1 = player('Ana', { DC: 'natural' }, { DC: 'natural', DM: 'competent' });
const cb2 = player('Bea', { DC: 'accomplished', DR: 'natural' });
const cb3 = player('Cris', { DC: 'unknown' });
const st = player('Dani', { ST: 'natural' });

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

  it('lists starters of the other phase that have no position in this phase', () => {
    const t = team([cb1, cb2], [
      asg(cb1.id, 'ip', 'starter', 'DCL'),
      asg(cb2.id, 'ip', 'starter', 'DCR'),
      asg(cb2.id, 'oop', 'starter', 'DCR'),
    ]);
    expect(unplacedStarters(t, 'oop')).toEqual([cb1.id]);
    expect(unplacedStarters(t, 'ip')).toEqual([]);
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

  it('replaces the occupant, keeps the slot role and mirrors the change in the other phase', () => {
    const t = team([cb1, cb2], [
      asg(cb1.id, 'ip', 'starter', 'DCL', 'bpcb'),
      asg(cb1.id, 'oop', 'starter', 'DCR', 'ccb'),
    ]);
    const r = assignPlayer(t, cb2.id, 'ip', 'DCL', 'starter');
    expect(starterOf(r.team, 'ip', 'DCL')).toMatchObject({ playerId: cb2.id, role: 'bpcb' });
    expect(starterOf(r.team, 'oop', 'DCR')).toMatchObject({ playerId: cb2.id, role: 'ccb' });
    expect(isStarter(r.team, cb1.id, 'ip')).toBe(false);
    expect(isStarter(r.team, cb1.id, 'oop')).toBe(false);
  });

  it('does not mirror when the incoming player already starts in the other phase', () => {
    const t = team([cb1, cb2], [
      asg(cb1.id, 'ip', 'starter', 'DCL'),
      asg(cb1.id, 'oop', 'starter', 'DCR'),
      asg(cb2.id, 'oop', 'starter', 'DCL'),
    ]);
    const r = assignPlayer(t, cb2.id, 'ip', 'DCL', 'starter');
    expect(starterOf(r.team, 'oop', 'DCR')?.playerId).toBe(cb1.id);
    expect(starterOf(r.team, 'oop', 'DCL')?.playerId).toBe(cb2.id);
    expect(invariantErrors(r.team)).toEqual([]);
  });

  it('swaps two starters of the same phase, roles stay with the slots', () => {
    const t = team([cb1, cb2], [
      asg(cb1.id, 'ip', 'starter', 'DCL', 'cb'),
      asg(cb2.id, 'ip', 'starter', 'DCR', 'bpcb'),
    ]);
    const r = assignPlayer(t, cb2.id, 'ip', 'DCL', 'starter');
    expect(starterOf(r.team, 'ip', 'DCL')).toMatchObject({ playerId: cb2.id, role: 'cb' });
    expect(starterOf(r.team, 'ip', 'DCR')).toMatchObject({ playerId: cb1.id, role: 'bpcb' });
  });

  it('moves a starter to an empty slot, keeping a valid role and clearing an invalid one', () => {
    const t = team([cb1], [asg(cb1.id, 'ip', 'starter', 'DCL', 'bpcb')]);
    const sameGroup = assignPlayer(t, cb1.id, 'ip', 'DCR', 'starter').team;
    expect(starterOf(sameGroup, 'ip', 'DCR')?.role).toBe('bpcb');
    const otherGroup = assignPlayer(t, cb1.id, 'ip', 'DMC', 'starter').team;
    expect(starterOf(otherGroup, 'ip', 'DMC')?.role).toBeNull();
    expect(startersCount(otherGroup, 'ip')).toBe(1);
  });

  it('keeps custom roles when moving to another position', () => {
    const t = team([cb1], [asg(cb1.id, 'ip', 'starter', 'DCL', 'custom:Libero')]);
    const r = assignPlayer(t, cb1.id, 'ip', 'DMC', 'starter');
    expect(starterOf(r.team, 'ip', 'DMC')?.role).toBe('custom:Libero');
  });

  it('is a no-op when the player already starts in that slot', () => {
    const t = team([cb1], [asg(cb1.id, 'ip', 'starter', 'DCL')]);
    expect(assignPlayer(t, cb1.id, 'ip', 'DCL', 'starter').team).toBe(t);
  });

  it('drops the player’s sub assignments in the slot he now starts in', () => {
    const t = team([cb1, cb2], [
      asg(cb2.id, 'ip', 'starter', 'DCL'),
      asg(cb1.id, 'ip', 'main', 'DCL'),
      asg(cb1.id, 'ip', 'main', 'DCR'),
    ]);
    const r = assignPlayer(t, cb1.id, 'ip', 'DCL', 'starter');
    expect(mainOf(r.team, 'ip', 'DCL')).toBeUndefined();
    expect(mainOf(r.team, 'ip', 'DCR')?.playerId).toBe(cb1.id);
    expect(invariantErrors(r.team)).toEqual([]);
  });
});

describe('assignPlayer — substitutes', () => {
  it('creates a main sub and lets one player be main sub in several slots', () => {
    let t = team([cb1]);
    t = assignPlayer(t, cb1.id, 'ip', 'DCL', 'main').team;
    t = assignPlayer(t, cb1.id, 'ip', 'DCR', 'main').team;
    expect(mainOf(t, 'ip', 'DCL')?.playerId).toBe(cb1.id);
    expect(mainOf(t, 'ip', 'DCR')?.playerId).toBe(cb1.id);
  });

  it('replaces the main sub and keeps the slot role', () => {
    const t = team([cb1, cb2], [asg(cb1.id, 'ip', 'main', 'DCL', 'nncb')]);
    const r = assignPlayer(t, cb2.id, 'ip', 'DCL', 'main');
    expect(mainOf(r.team, 'ip', 'DCL')).toMatchObject({ playerId: cb2.id, role: 'nncb' });
    expect(r.team.assignments).toHaveLength(1);
  });

  it('turns an aux sub into the main sub, carrying his role', () => {
    const t = team([cb1], [asg(cb1.id, 'ip', 'aux', 'DCL', 'cb')]);
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

  it('allows a starter to be a sub in another slot', () => {
    const t = team([cb1], [asg(cb1.id, 'ip', 'starter', 'DCL')]);
    const r = assignPlayer(t, cb1.id, 'ip', 'DMC', 'main');
    expect(mainOf(r.team, 'ip', 'DMC')?.playerId).toBe(cb1.id);
    expect(isStarter(r.team, cb1.id, 'ip')).toBe(true);
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
    expect(starterOf(swapped, 'ip', 'DCR')).toMatchObject({ playerId: cb1.id, role: 'bpcb' });
    expect(starterOf(swapped, 'ip', 'DCL')).toMatchObject({ playerId: cb2.id, role: 'cb' });
  });

  it('clears roles that do not fit the new position', () => {
    const a1 = asg(cb1.id, 'ip', 'main', 'DCL', 'bpcb');
    const r = moveAssignment(team([cb1], [a1]), a1.id, 'STC').team;
    expect(mainOf(r, 'ip', 'STC')?.role).toBeNull();
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
    const r = promoteToMain(team([cb1, cb2], [main, aux]), aux.id);
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

  it('creates empty teams and unique ids', () => {
    const t = emptyTeam('Nuevo');
    expect(t).toMatchObject({ name: 'Nuevo', players: [], assignments: [] });
    const ids = new Set(Array.from({ length: 500 }, uid));
    expect(ids.size).toBe(500);
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
      } else if (op < 0.9 && t.assignments.length) {
        t = promoteToMain(t, pick(t.assignments).id);
      } else if (t.assignments.length) {
        t = removeAssignment(t, pick(t.assignments).id);
      }
      const errors = invariantErrors(t);
      if (errors.length) throw new Error(`step ${i}: ${errors.join('; ')}`);
    }
  });
});
