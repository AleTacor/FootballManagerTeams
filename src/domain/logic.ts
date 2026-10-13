import { FAMILIARITY_RANK, SLOT_BY_ID } from './positions';
import { roleFits } from './roles';
import type { Assignment, Familiarity, Phase, Player, SlotId, Team, Tier } from './types';

export const MAX_STARTERS = 11;

export type LogicError = 'tooManyStarters';
export interface Result {
  team: Team;
  error?: LogicError;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const other = (phase: Phase): Phase => (phase === 'ip' ? 'oop' : 'ip');

function clone(team: Team): Team {
  return {
    ...team,
    players: team.players.map((p) => ({ ...p, positions: { ip: { ...p.positions.ip }, oop: { ...p.positions.oop } } })),
    assignments: team.assignments.map((a) => ({ ...a })),
  };
}

/* ---------- queries ---------- */

export function familiarityAt(player: Player | undefined, phase: Phase, slot: SlotId): Familiarity | null {
  if (!player) return null;
  return player.positions[phase][SLOT_BY_ID[slot].pos] ?? null;
}

export function canPlay(player: Player, phase: Phase, slot: SlotId): boolean {
  return familiarityAt(player, phase, slot) !== null;
}

export function starterOf(team: Team, phase: Phase, slot: SlotId): Assignment | undefined {
  return team.assignments.find((a) => a.phase === phase && a.slot === slot && a.tier === 'starter');
}

export function mainOf(team: Team, phase: Phase, slot: SlotId): Assignment | undefined {
  return team.assignments.find((a) => a.phase === phase && a.slot === slot && a.tier === 'main');
}

export function auxOf(team: Team, phase: Phase, slot: SlotId): Assignment[] {
  return team.assignments.filter((a) => a.phase === phase && a.slot === slot && a.tier === 'aux');
}

export function starterAssignment(team: Team, playerId: string, phase: Phase): Assignment | undefined {
  return team.assignments.find((a) => a.playerId === playerId && a.phase === phase && a.tier === 'starter');
}

export function startersCount(team: Team, phase: Phase): number {
  return team.assignments.filter((a) => a.phase === phase && a.tier === 'starter').length;
}

export function isStarter(team: Team, playerId: string, phase: Phase): boolean {
  return !!starterAssignment(team, playerId, phase);
}

/** Starters in the other phase that still have no position in this one. */
export function unplacedStarters(team: Team, phase: Phase): string[] {
  return team.assignments
    .filter((a) => a.phase === other(phase) && a.tier === 'starter')
    .map((a) => a.playerId)
    .filter((pid) => !isStarter(team, pid, phase));
}

export function sortByFamiliarity(players: Player[], phase: Phase, slot: SlotId): Player[] {
  return [...players].sort((a, b) => {
    const fa = familiarityAt(a, phase, slot);
    const fb = familiarityAt(b, phase, slot);
    const ra = fa ? FAMILIARITY_RANK[fa] : 99;
    const rb = fb ? FAMILIARITY_RANK[fb] : 99;
    return ra - rb || a.name.localeCompare(b.name);
  });
}

/* ---------- commands ---------- */

/** Removes sub assignments of a player in a slot (a player can't be starter and sub of the same slot). */
function dropSameSlot(team: Team, playerId: string, phase: Phase, slot: SlotId, keep?: Assignment) {
  team.assignments = team.assignments.filter(
    (a) => a === keep || !(a.playerId === playerId && a.phase === phase && a.slot === slot),
  );
}

/**
 * Puts a player in a slot as starter / main sub / aux sub, replacing the current
 * occupant of that tier (starters and main subs only). Roles belong to the slot,
 * so a replacement keeps the slot's role.
 */
export function assignPlayer(src: Team, playerId: string, phase: Phase, slot: SlotId, tier: Tier): Result {
  const team = clone(src);
  const pos = SLOT_BY_ID[slot].pos;

  if (tier === 'starter') {
    const occ = starterOf(team, phase, slot);
    const own = starterAssignment(team, playerId, phase);
    if (occ && occ.playerId === playerId) return { team: src };

    if (occ && own) {
      // Both are starters in this phase: swap them, roles stay with the slots.
      const prev = occ.playerId;
      occ.playerId = playerId;
      own.playerId = prev;
      dropSameSlot(team, playerId, phase, slot, occ);
      dropSameSlot(team, prev, phase, own.slot, own);
    } else if (occ) {
      const replaced = occ.playerId;
      occ.playerId = playerId;
      dropSameSlot(team, playerId, phase, slot, occ);
      // Mirror the substitution in the other phase, as in the game.
      const replacedOther = starterAssignment(team, replaced, other(phase));
      if (replacedOther && !isStarter(team, playerId, other(phase))) {
        replacedOther.playerId = playerId;
        dropSameSlot(team, playerId, other(phase), replacedOther.slot, replacedOther);
      }
    } else if (own) {
      own.slot = slot;
      if (!roleFits(own.role, pos, phase)) own.role = null;
      dropSameSlot(team, playerId, phase, slot, own);
    } else {
      if (startersCount(team, phase) >= MAX_STARTERS) return { team: src, error: 'tooManyStarters' };
      dropSameSlot(team, playerId, phase, slot);
      team.assignments.push({ id: uid(), playerId, phase, slot, tier: 'starter', role: null });
    }
    return { team };
  }

  if (tier === 'main') {
    const occ = mainOf(team, phase, slot);
    if (occ && occ.playerId === playerId) return { team: src };
    if (occ) {
      occ.playerId = playerId;
      dropSameSlot(team, playerId, phase, slot, occ);
    } else {
      const aux = auxOf(team, phase, slot).find((a) => a.playerId === playerId);
      dropSameSlot(team, playerId, phase, slot);
      team.assignments.push({ id: uid(), playerId, phase, slot, tier: 'main', role: aux?.role ?? null });
    }
    return { team };
  }

  // aux
  const existing = team.assignments.find(
    (a) => a.playerId === playerId && a.phase === phase && a.slot === slot && a.tier !== 'starter',
  );
  if (existing) return { team: src };
  if (starterOf(team, phase, slot)?.playerId === playerId) return { team: src };
  team.assignments.push({ id: uid(), playerId, phase, slot, tier: 'aux', role: null });
  return { team };
}

/** Drag on the pitch: move an assignment to another slot (swap if the target tier is taken). */
export function moveAssignment(src: Team, assignmentId: string, toSlot: SlotId): Result {
  const team = clone(src);
  const a = team.assignments.find((x) => x.id === assignmentId);
  if (!a || a.slot === toSlot) return { team: src };
  const pos = SLOT_BY_ID[toSlot].pos;

  if (a.tier === 'aux') {
    const dup = team.assignments.find(
      (x) => x.playerId === a.playerId && x.phase === a.phase && x.slot === toSlot && x !== a,
    );
    if (dup) return { team: src };
    a.slot = toSlot;
    if (!roleFits(a.role, pos, a.phase)) a.role = null;
    return { team };
  }

  const target = team.assignments.find((x) => x.phase === a.phase && x.slot === toSlot && x.tier === a.tier);
  if (target) {
    // Swap players; roles stay with the slots.
    const p = target.playerId;
    target.playerId = a.playerId;
    a.playerId = p;
    dropSameSlot(team, target.playerId, a.phase, toSlot, target);
    dropSameSlot(team, a.playerId, a.phase, a.slot, a);
  } else {
    a.slot = toSlot;
    if (!roleFits(a.role, pos, a.phase)) a.role = null;
    dropSameSlot(team, a.playerId, a.phase, toSlot, a);
  }
  return { team };
}

export function removeAssignment(src: Team, assignmentId: string): Team {
  return { ...src, assignments: src.assignments.filter((a) => a.id !== assignmentId) };
}

export function setRole(src: Team, assignmentId: string, role: string | null): Team {
  return {
    ...src,
    assignments: src.assignments.map((a) => (a.id === assignmentId ? { ...a, role } : a)),
  };
}

/** Aux → main. The previous main sub (if any) becomes aux. */
export function promoteToMain(src: Team, assignmentId: string): Team {
  const team = clone(src);
  const a = team.assignments.find((x) => x.id === assignmentId);
  if (!a || a.tier !== 'aux') return src;
  const current = mainOf(team, a.phase, a.slot);
  if (current) current.tier = 'aux';
  a.tier = 'main';
  return team;
}

export function upsertPlayer(src: Team, player: Player): Team {
  const team = clone(src);
  const i = team.players.findIndex((p) => p.id === player.id);
  if (i >= 0) team.players[i] = player;
  else team.players.push(player);
  return team;
}

export function removePlayer(src: Team, playerId: string): Team {
  return {
    ...src,
    players: src.players.filter((p) => p.id !== playerId),
    assignments: src.assignments.filter((a) => a.playerId !== playerId),
  };
}

export function emptyTeam(name: string): Team {
  return { id: uid(), name, players: [], assignments: [] };
}
