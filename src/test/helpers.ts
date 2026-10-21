import { SLOT_BY_ID, SLOTS } from '../domain/positions';
import { roleFits } from '../domain/roles';
import type { Assignment, Phase, Player, PositionMap, SlotId, Team, Tier } from '../domain/types';

/** Test builders and invariant checks shared by the unit tests. */

export function player(name: string, ip: PositionMap, oop: PositionMap = ip): Player {
  return { id: `p-${name}`, name, positions: { ip: { ...ip }, oop: { ...oop } } };
}

let seq = 0;
export function asg(
  playerId: string, phase: Phase, tier: Tier, slot: SlotId, role: string | null = null, replaces: string | null = null,
): Assignment {
  seq += 1;
  return { id: `a-${seq}`, playerId, phase, tier, slot, role, replaces };
}

export function team(players: Player[], assignments: Assignment[] = []): Team {
  return { id: 't-1', name: 'Test FC', players, assignments };
}

/** Deep copy, to check that a function did not mutate its input. */
export const snapshot = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Returns the list of broken lineup rules (empty = valid). */
export function invariantErrors(t: Team): string[] {
  const errors: string[] = [];
  const ids = new Set(t.players.map((p) => p.id));
  const seen = new Set<string>();
  for (const a of t.assignments) {
    if (!ids.has(a.playerId)) errors.push(`assignment ${a.id} points to missing player ${a.playerId}`);
    if (t.players.find((p) => p.id === a.playerId)?.target) errors.push(`transfer target ${a.playerId} has assignment ${a.id}`);
    const key = `${a.phase}|${a.slot}|${a.playerId}`;
    if (seen.has(key)) errors.push(`player ${a.playerId} assigned twice to ${a.phase} ${a.slot}`);
    seen.add(key);
    if (!roleFits(a.role, SLOT_BY_ID[a.slot].pos, a.phase)) errors.push(`assignment ${a.id}: role ${a.role} doesn't fit ${a.slot}`);
  }
  for (const p of t.players) {
    for (const phase of ['ip', 'oop'] as Phase[]) {
      for (const slot of SLOTS) {
        const role = p.roles?.[phase]?.[slot.id];
        if (role && !roleFits(role, slot.pos, phase)) errors.push(`${p.id} remembers ${role} for ${phase} ${slot.id}`);
      }
    }
  }
  for (const phase of ['ip', 'oop'] as Phase[]) {
    const starters = t.assignments.filter((a) => a.phase === phase && a.tier === 'starter');
    if (starters.length > 11) errors.push(`${phase}: ${starters.length} starters`);
    const bySlot = new Set<string>();
    const byPlayer = new Set<string>();
    for (const s of starters) {
      if (bySlot.has(s.slot)) errors.push(`${phase}: two starters in ${s.slot}`);
      if (byPlayer.has(s.playerId)) errors.push(`${phase}: ${s.playerId} starts twice`);
      bySlot.add(s.slot);
      byPlayer.add(s.playerId);
    }
    for (const s of starters) {
      if (!t.assignments.some((a) => a.playerId === s.playerId && a.phase !== phase && a.tier === 'starter')) {
        errors.push(`${s.playerId} starts in ${phase} only`);
      }
    }
    for (const p of t.players) {
      const isMain = (ph: Phase) => t.assignments.some((a) => a.playerId === p.id && a.phase === ph && a.tier === 'main');
      if (isMain(phase) && !isMain(phase === 'ip' ? 'oop' : 'ip')) errors.push(`${p.id} is main sub in ${phase} only`);
    }
    const startIds = new Set(starters.map((s) => s.playerId));
    const outfield = starters.filter((s) => s.slot !== 'GK').length;
    if (outfield > 10) errors.push(`${phase}: ${outfield} outfield starters`);
    const keeper = starters.find((s) => s.slot === 'GK')?.playerId;
    const otherKeeper = t.assignments.find((a) => a.phase !== phase && a.tier === 'starter' && a.slot === 'GK')?.playerId;
    if (keeper !== otherKeeper) errors.push(`${phase}: goalkeeper ${keeper} differs from the other phase (${otherKeeper})`);
    const startSlot = new Map(starters.map((s) => [s.playerId, s.slot]));
    const replaced = new Set<string>();
    for (const a of t.assignments.filter((x) => x.phase === phase)) {
      if (a.tier === 'starter') {
        if (a.replaces !== null) errors.push(`${phase}: starter ${a.playerId} replaces someone`);
        continue;
      }
      if (a.tier === 'main' && startIds.has(a.playerId)) errors.push(`${phase}: starter ${a.playerId} is also a main sub`);
      const fits = (id: string) => id !== a.playerId && startIds.has(id) && (startSlot.get(id) === 'GK') === (a.slot === 'GK');
      if (a.replaces !== null && !fits(a.replaces)) {
        errors.push(`${phase}: sub ${a.id} in ${a.slot} can't replace ${a.replaces}`);
      }
      if (a.tier === 'main' && a.replaces) {
        if (replaced.has(a.replaces)) errors.push(`${phase}: two main subs replace ${a.replaces}`);
        replaced.add(a.replaces);
      }
    }
    const mains = new Set<string>();
    for (const m of t.assignments.filter((a) => a.phase === phase && a.tier === 'main')) {
      if (mains.has(m.slot)) errors.push(`${phase}: two main subs in ${m.slot}`);
      mains.add(m.slot);
    }
  }
  return errors;
}

/** Small deterministic random generator for fuzz tests. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
