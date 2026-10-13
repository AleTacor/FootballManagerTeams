import type { Assignment, Phase, Player, PositionMap, SlotId, Team, Tier } from '../domain/types';

/** Test builders and invariant checks shared by the unit tests. */

export function player(name: string, ip: PositionMap, oop: PositionMap = ip): Player {
  return { id: `p-${name}`, name, positions: { ip: { ...ip }, oop: { ...oop } } };
}

let seq = 0;
export function asg(
  playerId: string, phase: Phase, tier: Tier, slot: SlotId, role: string | null = null,
): Assignment {
  seq += 1;
  return { id: `a-${seq}`, playerId, phase, tier, slot, role };
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
    const key = `${a.phase}|${a.slot}|${a.playerId}`;
    if (seen.has(key)) errors.push(`player ${a.playerId} assigned twice to ${a.phase} ${a.slot}`);
    seen.add(key);
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
