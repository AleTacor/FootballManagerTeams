import { FAMILIARITY_RANK, SLOT_BY_ID, SLOTS } from './positions';
import { defaultRole, roleFits } from './roles';
import type { Assignment, Familiarity, Phase, Player, SignAs, SlotId, Team, Tier } from './types';

export const MAX_STARTERS = 11;
/** Outfield starters per phase: the 11th place is the goalkeeper's (the GK slot). */
export const MAX_OUTFIELD = MAX_STARTERS - 1;
const GK: SlotId = 'GK';

export type LogicError = 'tooManyStarters' | 'outfieldFull' | 'starterNotMain';
export interface Result {
  team: Team;
  error?: LogicError;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const PHASES: Phase[] = ['ip', 'oop'];
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

/** Transfer targets aren't in the squad yet: they never get lineup assignments. */
export function isTarget(team: Team, playerId: string): boolean {
  return !!team.players.find((p) => p.id === playerId)?.target;
}

/** Players in the squad, without transfer targets. */
export function squadPlayers(team: Team): Player[] {
  return team.players.filter((p) => !p.target);
}

export function targetPlayers(team: Team): Player[] {
  return team.players.filter((p) => p.target);
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

export function outfieldCount(team: Team, phase: Phase): number {
  return team.assignments.filter((a) => a.phase === phase && a.tier === 'starter' && a.slot !== GK).length;
}

/**
 * Whether a sub playing in `slot` can come on for `starterId`: he must start in that phase
 * (and not be the sub himself), and the goalkeeper rule holds: a sub in the GK slot replaces
 * the starting goalkeeper, and only subs in the GK slot do.
 */
export function canReplace(team: Team, phase: Phase, slot: SlotId, playerId: string, starterId: string | null): boolean {
  if (!starterId || starterId === playerId) return false;
  const start = starterAssignment(team, starterId, phase);
  return !!start && (start.slot === GK) === (slot === GK);
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

/**
 * Removes a player's other assignments in a slot (a player can't be starter and sub of the
 * same slot). Dropping his start there also drops his start in the other phase (linked starts).
 */
function dropSameSlot(team: Team, playerId: string, phase: Phase, slot: SlotId, keep?: Assignment) {
  const gone = team.assignments.filter((a) => a !== keep && a.playerId === playerId && a.phase === phase && a.slot === slot);
  if (!gone.length) return;
  const partner = gone.some((a) => a.tier === 'starter') ? starterAssignment(team, playerId, other(phase)) : undefined;
  team.assignments = team.assignments.filter((a) => !gone.includes(a) && a !== partner);
}

/**
 * Role a player gets on arriving at a slot: his last role in that slot and phase, else his
 * own current role there (`a.role`, only set when an aux sub of that slot becomes the main
 * sub), else the FM26 default for the position. A role never passes to another player
 * (`handOver`) or another slot (`relocate`): MCC's role doesn't carry over to MCR.
 */
function arrivalRole(team: Team, a: Assignment): string {
  const pos = SLOT_BY_ID[a.slot].pos;
  const remembered = team.players.find((p) => p.id === a.playerId)?.roles?.[a.phase]?.[a.slot];
  if (remembered && roleFits(remembered, pos, a.phase)) return remembered;
  if (a.role && roleFits(a.role, pos, a.phase)) return a.role;
  return defaultRole(pos, a.phase);
}

/** Records an assignment's role as the player's role for that slot and phase. */
function remember(team: Team, a: Assignment) {
  const player = team.players.find((p) => p.id === a.playerId);
  if (!player) return;
  const bySlot = { ...player.roles?.[a.phase] };
  if (a.role) bySlot[a.slot] = a.role;
  else delete bySlot[a.slot];
  player.roles = { ...player.roles, [a.phase]: bySlot };
}

/** Gives an assignment to another player; the previous player's role doesn't pass on. */
function handOver(team: Team, a: Assignment, playerId: string) {
  a.playerId = playerId;
  a.role = null;
  settle(team, a);
}

/** Moves an assignment to another slot; its old slot's role stays behind. */
function relocate(team: Team, a: Assignment, slot: SlotId) {
  a.slot = slot;
  a.role = null;
  settle(team, a);
}

/** Gives a player who just arrived at an assignment his role there, and remembers it. */
function settle(team: Team, a: Assignment) {
  a.role = arrivalRole(team, a);
  remember(team, a);
}

/**
 * Free starter slot in `phase` for a player whose start in the other phase is at `slot`:
 * that same slot, else a free slot of the same position, else one he can play, else any;
 * the nearest on the pitch within each group.
 */
function partnerSlot(team: Team, playerId: string, phase: Phase, slot: SlotId): SlotId | null {
  // The goalkeeper is the same in both phases, and nobody else is put in goal.
  if (slot === GK) return starterOf(team, phase, GK) ? null : GK;
  if (outfieldCount(team, phase) >= MAX_OUTFIELD) return null;
  const at = SLOT_BY_ID[slot];
  const player = team.players.find((p) => p.id === playerId);
  const rank = (s: (typeof SLOTS)[number]) =>
    s.id === slot ? 0 : s.pos === at.pos ? 1 : player && canPlay(player, phase, s.id) ? 2 : 3;
  const free = SLOTS.filter((s) => s.id !== GK && !starterOf(team, phase, s.id));
  free.sort((a, b) => rank(a) - rank(b) || Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y));
  return free[0]?.id ?? null;
}

/**
 * The goalkeeper is the same player in both phases. After a change of starters in `from`,
 * makes the other phase match: the new goalkeeper goes in goal there too (swapping places with
 * the one who was there), or, if `from` has nobody in goal, the other phase's goalkeeper
 * moves to a free outfield slot near where he plays in `from`.
 */
function syncGoalkeeper(team: Team, from: Phase) {
  const to = other(from);
  const keeper = starterOf(team, from, GK);
  const there = starterOf(team, to, GK);
  if (keeper?.playerId === there?.playerId) return;
  if (keeper) {
    const his = starterAssignment(team, keeper.playerId, to);
    if (!his) return;
    const freed = his.slot;
    if (there) relocate(team, there, freed);
    relocate(team, his, GK);
    dropSameSlot(team, his.playerId, to, GK, his);
    if (there) dropSameSlot(team, there.playerId, to, freed, there);
    return;
  }
  const own = there && starterAssignment(team, there.playerId, from);
  const slot = own ? partnerSlot(team, there!.playerId, to, own.slot) : null;
  if (there && slot) {
    relocate(team, there, slot);
    dropSameSlot(team, there.playerId, to, slot, there);
  } else if (there) {
    team.assignments = team.assignments.filter((a) => a !== there && a !== own);
  }
}

/**
 * Starters are linked across phases: a player starts in both or in neither. Gives a player
 * who starts in only one phase his start in the other (see partnerSlot), or drops the lone
 * start if the other phase is already full.
 */
function pairStart(team: Team, playerId: string) {
  for (const phase of PHASES) {
    const a = starterAssignment(team, playerId, phase);
    const to = other(phase);
    if (!a || isStarter(team, playerId, to)) continue;
    const slot = startersCount(team, to) < MAX_STARTERS ? partnerSlot(team, playerId, to, a.slot) : null;
    if (!slot) {
      team.assignments = team.assignments.filter((x) => x !== a);
      continue;
    }
    dropSameSlot(team, playerId, to, slot);
    const added: Assignment = { id: uid(), playerId, phase: to, slot, tier: 'starter', role: null, replaces: null };
    settle(team, added);
    team.assignments.push(added);
  }
}

export function isMainSub(team: Team, playerId: string, phase: Phase): boolean {
  return team.assignments.some((a) => a.playerId === playerId && a.phase === phase && a.tier === 'main');
}

/**
 * Slot in `to` for the partner of a main sub at `slot` in the other phase who replaces
 * `replaces`: where that starter plays in `to`, else the same slot, else a slot of the same
 * position, else one he can play, else any; nearest first. Only slots with no main sub where
 * the player doesn't start.
 */
function mainPartnerSlot(team: Team, playerId: string, to: Phase, slot: SlotId, replaces: string | null): SlotId | null {
  const linked = replaces ? starterAssignment(team, replaces, to)?.slot : undefined;
  const at = SLOT_BY_ID[linked ?? slot];
  const player = team.players.find((p) => p.id === playerId);
  const rank = (s: (typeof SLOTS)[number]) =>
    s.id === linked ? 0 : s.id === slot ? 1 : s.pos === at.pos ? 2 : player && canPlay(player, to, s.id) ? 3 : 4;
  // Only slots where someone else starts (main subs go where a starter plays). Goalkeeper rule:
  // a GK sub stays in goal, an outfield sub stays out of it.
  const free = SLOTS.filter((s) => {
    const start = starterOf(team, to, s.id);
    return (s.id === GK) === (slot === GK) && !mainOf(team, to, s.id) && !!start && start.playerId !== playerId;
  });
  free.sort((a, b) => rank(a) - rank(b) || Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y));
  return free[0]?.id ?? null;
}

/** Makes a player who is main sub in one phase only also main sub in the other (or drops it if there's no room). */
function pairMain(team: Team, playerId: string, from: Phase) {
  const to = other(from);
  const lone = team.assignments.filter((a) => a.playerId === playerId && a.phase === from && a.tier === 'main');
  const slot = lone.length ? mainPartnerSlot(team, playerId, to, lone[0].slot, lone[0].replaces) : null;
  if (!slot) {
    team.assignments = team.assignments.filter((a) => !lone.includes(a));
    return;
  }
  dropSameSlot(team, playerId, to, slot);
  const added: Assignment = { id: uid(), playerId, phase: to, slot, tier: 'main', role: null, replaces: lone[0].replaces };
  settle(team, added);
  team.assignments.push(added);
}

/**
 * Main subs are linked across phases like starts: a player is main sub in both phases or in
 * neither. After a command (`src` → `next`), a player who became main sub in one phase only
 * gets a main sub spot in the other (mainPartnerSlot); one who stopped being main sub in a
 * phase stops in the other too. Aux subs are free.
 */
function linkMains(src: Team, next: Team): Team {
  const fix: { playerId: string; gained: Phase | null; lost: Phase | null }[] = [];
  for (const p of next.players) {
    const now = PHASES.map((ph) => isMainSub(next, p.id, ph));
    if (now[0] === now[1]) continue;
    const lost = PHASES.find((ph, i) => !now[i] && isMainSub(src, p.id, ph)) ?? null;
    fix.push({ playerId: p.id, lost, gained: lost ? null : PHASES[now[0] ? 0 : 1] });
  }
  if (!fix.length) return next;
  const team = clone(next);
  // Drop first, so the spots they free can take the new partners.
  fix.sort((a, b) => Number(!a.lost) - Number(!b.lost));
  for (const f of fix) {
    if (f.lost) {
      const keep = other(f.lost);
      team.assignments = team.assignments.filter((a) => !(a.playerId === f.playerId && a.phase === keep && a.tier === 'main'));
    } else if (f.gained) {
      pairMain(team, f.playerId, f.gained);
    }
  }
  return team;
}

/** A starter can't be a main sub: drops main sub spots of players who start in that phase. */
function dropStarterMains(src: Team): Team {
  const bad = src.assignments.filter((a) => a.tier === 'main' && isStarter(src, a.playerId, a.phase));
  return bad.length ? { ...src, assignments: src.assignments.filter((a) => !bad.includes(a)) } : src;
}

/**
 * Starter a sub at `slot` replaces by default: the one starting in that slot, else one of the
 * same position, else the nearest; never the sub himself, nor one in `taken`.
 */
function defaultLink(team: Team, phase: Phase, slot: SlotId, playerId: string, taken?: Set<string>): string | null {
  const at = SLOT_BY_ID[slot];
  const starters = team.assignments.filter(
    (a) => a.phase === phase && a.tier === 'starter' && !taken?.has(a.playerId) && canReplace(team, phase, slot, playerId, a.playerId),
  );
  const rank = (a: Assignment) => (a.slot === slot ? 0 : SLOT_BY_ID[a.slot].pos === at.pos ? 1 : 2);
  const dist = (a: Assignment) => Math.hypot(SLOT_BY_ID[a.slot].x - at.x, SLOT_BY_ID[a.slot].y - at.y);
  starters.sort((a, b) => rank(a) - rank(b) || dist(a) - dist(b));
  return starters[0]?.playerId ?? null;
}

/** Starter an aux sub replaces by default: the one in his slot, if any (aux links are optional). */
function auxLink(team: Team, phase: Phase, slot: SlotId, playerId: string): string | null {
  const start = starterOf(team, phase, slot);
  return start && canReplace(team, phase, slot, playerId, start.playerId) ? start.playerId : null;
}

/** When a starter is replaced, the subs who came on for him now come on for his replacement. */
function transferLinks(team: Team, phase: Phase, from: string, to: string) {
  for (const a of team.assignments) {
    if (a.phase === phase && a.tier !== 'starter' && a.replaces === from) a.replaces = to;
  }
}

/**
 * Every sub replaces a starter of his phase (`replaces`), and each starter has at most one
 * main sub. Fixes links to players who don't start (or to the sub himself) with defaultLink,
 * and when two main subs replace the same starter keeps one (those in `prefer` first, then
 * the one playing in the starter's slot) and relinks the other to a starter without a main
 * sub, or to nobody.
 */
function normalizeLinks(src: Team, prefer: string[] = []): Team {
  const startsIn = (a: Assignment, id: string | null) => canReplace(src, a.phase, a.slot, a.playerId, id);
  const next = new Map<string, string | null>();
  for (const phase of PHASES) {
    const subs = src.assignments.filter((a) => a.phase === phase && a.tier !== 'starter');
    for (const a of subs.filter((x) => x.tier === 'aux')) {
      // An aux sub may replace nobody; a link that no longer works falls back to his slot's starter.
      next.set(a.id, a.replaces === null || startsIn(a, a.replaces) ? a.replaces : auxLink(src, phase, a.slot, a.playerId));
    }
    const mains = subs.filter((x) => x.tier === 'main');
    const order = (a: Assignment) =>
      prefer.includes(a.id) ? 0 : a.replaces && starterAssignment(src, a.replaces, phase)?.slot === a.slot ? 1 : 2;
    const taken = new Set<string>();
    const loose: Assignment[] = [];
    for (const a of [...mains].sort((x, y) => order(x) - order(y))) {
      if (startsIn(a, a.replaces) && !taken.has(a.replaces!)) {
        taken.add(a.replaces!);
        next.set(a.id, a.replaces);
      } else loose.push(a);
    }
    for (const a of loose) {
      const link = defaultLink(src, phase, a.slot, a.playerId, taken);
      if (link) taken.add(link);
      next.set(a.id, link);
    }
  }
  const changed = src.assignments.some((a) => (a.tier === 'starter' ? a.replaces !== null : next.get(a.id) !== a.replaces));
  if (!changed) return src;
  return {
    ...src,
    assignments: src.assignments.map((a) => {
      const replaces = a.tier === 'starter' ? null : next.get(a.id) ?? null;
      return replaces === a.replaces ? a : { ...a, replaces };
    }),
  };
}

/** Runs after every command: starters lose main sub spots, main subs stay linked across phases, every sub replaces a starter. */
function finish(src: Team, next: Team, prefer: string[] = []): Team {
  return normalizeLinks(linkMains(src, dropStarterMains(next)), prefer);
}

/**
 * Fixes older saves and imports: more than 10 outfield starters, lone starts, a different
 * goalkeeper per phase, lone main subs, starters who are main subs, and sub links.
 */
export function linkLineup(src: Team): Team {
  const team = clone(src);
  // Transfer targets aren't in the squad: they have no place in the lineup.
  team.assignments = team.assignments.filter((a) => !isTarget(team, a.playerId));
  // At most 10 outfield starters per phase (older data could have 11): drop the extra ones.
  for (const phase of PHASES) {
    const outfield = team.assignments.filter((a) => a.phase === phase && a.tier === 'starter' && a.slot !== GK);
    const extra = new Set(outfield.slice(MAX_OUTFIELD));
    team.assignments = team.assignments.filter((a) => !extra.has(a));
  }
  for (const p of team.players.filter((x) => isStarter(team, x.id, 'ip') !== isStarter(team, x.id, 'oop'))) pairStart(team, p.id);
  syncGoalkeeper(team, 'ip');
  const fixed = JSON.stringify(team.assignments) === JSON.stringify(src.assignments) ? src : team;
  return finish({ ...fixed, assignments: [] }, fixed);
}

/**
 * Puts a player in a slot as starter / main sub / aux sub, replacing the current
 * occupant of that tier (starters and main subs only). Replacing a starter or main sub
 * mirrors the change in the other phase, and a new starter also starts in the other phase
 * (see pairStart). The player gets his remembered role for the slot, else the FM26 default
 * (see arrivalRole).
 */
export function assignPlayer(src: Team, playerId: string, phase: Phase, slot: SlotId, tier: Tier): Result {
  const r = assign(src, playerId, phase, slot, tier);
  if (r.team === src) return r;
  // The sub just placed keeps the starter of his slot if two main subs want him.
  const placed = r.team.assignments.filter((a) => a.playerId === playerId && a.slot === slot && a.tier === tier).map((a) => a.id);
  return { ...r, team: finish(src, r.team, placed) };
}

function assign(src: Team, playerId: string, phase: Phase, slot: SlotId, tier: Tier): Result {
  if (isTarget(src, playerId)) return { team: src };
  const team = clone(src);

  if (tier === 'starter') {
    const occ = starterOf(team, phase, slot);
    const own = starterAssignment(team, playerId, phase);
    if (occ && occ.playerId === playerId) return { team: src };

    if (occ && own) {
      // Both are starters in this phase: swap them.
      const prev = occ.playerId;
      handOver(team, occ, playerId);
      handOver(team, own, prev);
      dropSameSlot(team, playerId, phase, slot, occ);
      dropSameSlot(team, prev, phase, own.slot, own);
      syncGoalkeeper(team, phase);
    } else if (occ) {
      const replaced = occ.playerId;
      handOver(team, occ, playerId);
      transferLinks(team, phase, replaced, playerId);
      dropSameSlot(team, playerId, phase, slot, occ);
      // Mirror the substitution in the other phase, as in the game.
      const replacedOther = starterAssignment(team, replaced, other(phase));
      if (replacedOther && !isStarter(team, playerId, other(phase))) {
        handOver(team, replacedOther, playerId);
        transferLinks(team, other(phase), replaced, playerId);
        dropSameSlot(team, playerId, other(phase), replacedOther.slot, replacedOther);
      } else if (replacedOther) {
        // Only possible with unlinked data: the replaced player can't keep half a start.
        team.assignments = team.assignments.filter((a) => a !== replacedOther);
      }
      pairStart(team, playerId);
    } else if (own) {
      if (own.slot === GK && outfieldCount(team, phase) >= MAX_OUTFIELD) return { team: src, error: 'outfieldFull' };
      relocate(team, own, slot);
      dropSameSlot(team, playerId, phase, slot, own);
      syncGoalkeeper(team, phase);
    } else {
      const full = (['ip', 'oop'] as Phase[]).some((ph) => startersCount(team, ph) - (isStarter(team, playerId, ph) ? 1 : 0) >= MAX_STARTERS);
      if (full) return { team: src, error: 'tooManyStarters' };
      if (slot !== GK && outfieldCount(team, phase) >= MAX_OUTFIELD) return { team: src, error: 'outfieldFull' };
      dropSameSlot(team, playerId, phase, slot);
      const added: Assignment = { id: uid(), playerId, phase, slot, tier: 'starter', role: null, replaces: null };
      settle(team, added);
      team.assignments.push(added);
      pairStart(team, playerId);
      syncGoalkeeper(team, phase);
    }
    return { team };
  }

  if (tier === 'main') {
    if (isStarter(team, playerId, phase)) return { team: src, error: 'starterNotMain' };
    // Main subs only go where a starter plays; elsewhere the player is added as an aux sub.
    if (!starterOf(team, phase, slot)) return assign(src, playerId, phase, slot, 'aux');
    const occ = mainOf(team, phase, slot);
    if (occ && occ.playerId === playerId) return { team: src };
    if (occ) {
      const replaced = occ.playerId;
      handOver(team, occ, playerId);
      dropSameSlot(team, playerId, phase, slot, occ);
      // Mirror in the other phase: the replaced player's main sub spot there for the same
      // starter, else the same slot, else his only one; not where the incoming player starts.
      const mains = team.assignments.filter((a) => a.playerId === replaced && a.phase === other(phase) && a.tier === 'main');
      const mirror =
        mains.find((a) => occ.replaces && a.replaces === occ.replaces) ??
        mains.find((a) => a.slot === slot) ??
        (mains.length === 1 ? mains[0] : undefined);
      if (mirror && starterOf(team, other(phase), mirror.slot)?.playerId !== playerId) {
        handOver(team, mirror, playerId);
        dropSameSlot(team, playerId, other(phase), mirror.slot, mirror);
      }
    } else {
      const aux = auxOf(team, phase, slot).find((a) => a.playerId === playerId);
      dropSameSlot(team, playerId, phase, slot);
      const added: Assignment = {
        id: uid(), playerId, phase, slot, tier: 'main', role: aux?.role ?? null,
        replaces: aux?.replaces ?? defaultLink(team, phase, slot, playerId),
      };
      settle(team, added);
      team.assignments.push(added);
    }
    return { team };
  }

  // aux
  const existing = team.assignments.find(
    (a) => a.playerId === playerId && a.phase === phase && a.slot === slot && a.tier !== 'starter',
  );
  if (existing) return { team: src };
  if (starterOf(team, phase, slot)?.playerId === playerId) return { team: src };
  const added: Assignment = { id: uid(), playerId, phase, slot, tier: 'aux', role: null, replaces: auxLink(team, phase, slot, playerId) };
  settle(team, added);
  team.assignments.push(added);
  return { team };
}

/**
 * Drag on the pitch: move an assignment to another slot (swap if the target tier is taken).
 * A sub keeps the starter he replaces: moving him only changes where he plays.
 */
export function moveAssignment(src: Team, assignmentId: string, toSlot: SlotId): Result {
  const r = move(src, assignmentId, toSlot);
  return r.team === src ? r : { ...r, team: finish(src, r.team, [assignmentId]) };
}

function move(src: Team, assignmentId: string, toSlot: SlotId): Result {
  const team = clone(src);
  const a = team.assignments.find((x) => x.id === assignmentId);
  if (!a || a.slot === toSlot) return { team: src };

  if (a.tier === 'aux') {
    const dup = team.assignments.find(
      (x) => x.playerId === a.playerId && x.phase === a.phase && x.slot === toSlot && x !== a,
    );
    if (dup) return { team: src };
    relocate(team, a, toSlot);
    return { team };
  }
  // A main sub stays main wherever he's moved, even where nobody starts, and keeps the starter
  // he replaces (only the goalkeeper rule can change it; see canReplace).

  const target = team.assignments.find((x) => x.phase === a.phase && x.slot === toSlot && x.tier === a.tier);
  if (target) {
    // Swap players; each sub keeps the starter he replaces.
    const p = target.playerId;
    handOver(team, target, a.playerId);
    handOver(team, a, p);
    [target.replaces, a.replaces] = [a.replaces, target.replaces];
    dropSameSlot(team, target.playerId, a.phase, toSlot, target);
    dropSameSlot(team, a.playerId, a.phase, a.slot, a);
  } else {
    if (a.tier === 'starter' && a.slot === GK && outfieldCount(team, a.phase) >= MAX_OUTFIELD) {
      return { team: src, error: 'outfieldFull' };
    }
    relocate(team, a, toSlot);
    dropSameSlot(team, a.playerId, a.phase, toSlot, a);
  }
  if (a.tier === 'starter') syncGoalkeeper(team, a.phase);
  return { team };
}

/** Removes an assignment; removing a start also removes the player's start in the other phase. */
export function removeAssignment(src: Team, assignmentId: string): Team {
  const a = src.assignments.find((x) => x.id === assignmentId);
  if (!a) return src;
  const partner = a.tier === 'starter' ? starterAssignment(src, a.playerId, other(a.phase)) : undefined;
  return finish(src, { ...src, assignments: src.assignments.filter((x) => x !== a && x !== partner) });
}

/** Sets an assignment's role and remembers it as the player's role for that slot. */
export function setRole(src: Team, assignmentId: string, role: string | null): Team {
  const team = clone(src);
  const a = team.assignments.find((x) => x.id === assignmentId);
  if (!a || a.role === role) return src;
  a.role = role;
  remember(team, a);
  return team;
}

/** Aux → main (not for starters, and only where a starter plays). The previous main sub (if any) becomes aux. */
export function promoteToMain(src: Team, assignmentId: string): Team {
  const team = clone(src);
  const a = team.assignments.find((x) => x.id === assignmentId);
  if (!a || a.tier !== 'aux' || isStarter(team, a.playerId, a.phase) || !starterOf(team, a.phase, a.slot)) return src;
  const current = mainOf(team, a.phase, a.slot);
  if (current) current.tier = 'aux';
  a.tier = 'main';
  return finish(src, team, [a.id]);
}

/**
 * Sets the starter a sub replaces (null: nobody, aux subs only). For a main sub, the player's main sub spot in the other
 * phase for the same starter follows, and a main sub who replaced that starter before is
 * relinked (see normalizeLinks).
 */
export function setReplaces(src: Team, assignmentId: string, starterId: string | null): Team {
  const team = clone(src);
  const a = team.assignments.find((x) => x.id === assignmentId);
  if (!a || a.tier === 'starter' || a.replaces === starterId) return src;
  // Only aux subs may replace nobody.
  if (starterId === null ? a.tier !== 'aux' : !canReplace(team, a.phase, a.slot, a.playerId, starterId)) return src;
  const prefer = [a.id];
  if (a.tier === 'main') {
    const mirror = team.assignments.find(
      (x) => x.playerId === a.playerId && x.phase === other(a.phase) && x.tier === 'main' && x.replaces === a.replaces,
    );
    if (mirror && canReplace(team, mirror.phase, mirror.slot, mirror.playerId, starterId)) {
      mirror.replaces = starterId;
      prefer.push(mirror.id);
    }
  }
  a.replaces = starterId;
  return finish(src, team, prefer);
}

/**
 * Plans where a transfer target would play in one phase (null: nowhere). If the other phase
 * has no plan yet, it gets the same slot. In each phase whose slot changes he gets his
 * remembered role for that slot, else the FM26 default, like a player arriving there.
 */
export function planTarget(src: Team, playerId: string, phase: Phase, slot: SlotId | null): Team {
  const p = src.players.find((x) => x.id === playerId);
  if (!p?.target) return src;
  const was = p.target.slots;
  const slots = { ...was, [phase]: slot };
  if (slot && !slots[other(phase)]) slots[other(phase)] = slot;
  if (slots.ip === was.ip && slots.oop === was.oop) return src;
  const team = clone(src);
  team.players.find((x) => x.id === playerId)!.target = { slots };
  for (const ph of PHASES) {
    const at = slots[ph];
    if (at && at !== was[ph]) settle(team, { id: '', playerId, phase: ph, slot: at, tier: 'aux', role: null, replaces: null });
  }
  return team;
}

/** Sets a transfer target's planned role for one phase (remembered for his planned slot there). */
export function setTargetRole(src: Team, playerId: string, phase: Phase, role: string | null): Team {
  const p = src.players.find((x) => x.id === playerId);
  const slot = p?.target?.slots[phase];
  if (!p || !slot || (p.roles?.[phase]?.[slot] ?? null) === role) return src;
  const team = clone(src);
  remember(team, { id: '', playerId, phase, slot, tier: 'aux', role, replaces: null });
  return team;
}

/** Main subs of `phase` who cover `starterId` or play in `slot` drop to auxiliary (they keep slot, role and link). */
function demoteMains(team: Team, phase: Phase, starterId: string, slot: SlotId) {
  for (const a of team.assignments) {
    if (a.phase === phase && a.tier === 'main' && (a.replaces === starterId || a.slot === slot)) a.tier = 'aux';
  }
}

/**
 * Puts a player into the lineup at `slots[phase]` where there's no starter to swap with
 * (for that, see takeOver). Used by signTarget and promoteToStarter.
 * - starter: he starts there (if the XI has room); in the other phase he goes where the
 *   linking puts him, or to `slots[other]` if it's free. Nobody else moves.
 * - sub: in each phase with a slot, the main subs who cover that slot's starter (or play there)
 *   become aux and he becomes the main sub; with nobody starting there he's added as aux.
 * Fails like assignPlayer (XI full).
 */
function stepIn(src: Team, team: Team, playerId: string, phase: Phase, slots: Record<Phase, SlotId | null>, as: SignAs): Result {
  const slot = slots[phase]!;
  const q = other(phase);
  if (as === 'sub') {
    for (const ph of PHASES) {
      const start = slots[ph] && starterOf(team, ph, slots[ph]!);
      if (start) demoteMains(team, ph, start.playerId, slots[ph]!);
    }
    const r = assign(team, playerId, phase, slot, 'main');
    if (r.error) return { team: src, error: r.error };
    let next = r.team;
    if (slots[q] && !isMainSub(next, playerId, q)) next = assign(next, playerId, q, slots[q]!, 'main').team;
    const placed = next.assignments.filter((a) => a.playerId === playerId && a.tier === 'main').map((a) => a.id);
    return { team: finish(src, next, placed) };
  }
  // A sub stepping up in the slot he plays in keeps his role there.
  for (const a of team.assignments) {
    if (a.playerId === playerId && a.role && a.slot === slots[a.phase]) remember(team, a);
  }
  const r = assign(team, playerId, phase, slot, 'starter');
  if (r.error) return { team: src, error: r.error };
  let next = r.team;
  // In the other phase he moves to his slot there only if it's free: nobody else is moved.
  const mine = starterAssignment(next, playerId, q);
  if (slots[q] && mine && mine.slot !== slots[q] && !starterOf(next, q, slots[q]!)) {
    const m = move(next, mine.id, slots[q]!);
    if (!m.error) next = m.team;
  }
  return { team: finish(src, next) };
}

/**
 * Player `x` takes starter `y`'s place by swapping tiers, in both phases, without moving
 * anyone else: x starts in his own spot (`spotOf(phase)`) and y becomes his main sub in y's
 * own slot, each keeping his role there. y's old slot is left empty when x's spot is another
 * one. Main subs who covered y (or played in his slot) drop to aux there. In a phase where x
 * has no spot, or someone else starts in it, or it would put a different player in goal, x
 * takes y's slot instead (and y becomes main sub in x's sub spot, if x had one, else in his
 * own slot). Used by promoteToStarter (x's spot: his main sub assignment) and signTarget
 * (his planned slot).
 */
function takeOver(src: Team, team: Team, x: string, y: string, spotOf: (ph: Phase) => { slot: SlotId; a?: Assignment } | undefined): Result {
  const placed: string[] = [];
  const add = (playerId: string, ph: Phase, slot: SlotId, tier: Tier, role: string | null, replaces: string | null) => {
    dropSameSlot(team, playerId, ph, slot);
    const added: Assignment = { id: uid(), playerId, phase: ph, slot, tier, role, replaces };
    settle(team, added);
    team.assignments.push(added);
    return added;
  };
  for (const ph of PHASES) {
    const ys = starterAssignment(team, y, ph);
    if (!ys) continue;
    const spot = spotOf(ph);
    for (const s of team.assignments) {
      if (s !== spot?.a && s.phase === ph && s.tier === 'main' && (s.replaces === y || s.slot === ys.slot)) s.tier = 'aux';
    }
    // A sub stepping up in the slot he plays in keeps his role there.
    if (spot?.a?.role) remember(team, spot.a);
    const taken = spot && starterOf(team, ph, spot.slot);
    const keeper = spot && (spot.slot === GK) !== (ys.slot === GK);
    const inPlace = !!spot && !keeper && (!taken || taken.playerId === y);
    const startAt = inPlace ? spot!.slot : ys.slot;
    const subAt = inPlace || keeper || !spot?.a ? ys.slot : spot.a.slot;
    const xRole = spot?.a?.slot === startAt ? spot.a.role : null;
    const yRole = ys.slot === subAt ? ys.role : null;
    team.assignments = team.assignments.filter((s) => s !== ys && s !== spot?.a);
    add(x, ph, startAt, 'starter', xRole, null);
    transferLinks(team, ph, y, x);
    // Another main sub already playing in that slot (for someone else) drops to aux there.
    const there = mainOf(team, ph, subAt);
    if (there && there.playerId !== y) there.tier = 'aux';
    placed.push(add(y, ph, subAt, 'main', yRole, x).id);
  }
  return { team: finish(src, team, placed) };
}

/**
 * Signs a transfer target: he joins the squad. With a planned slot he also joins the lineup,
 * starting from `phase` (or the phase that has a plan):
 * - as starter: like promoting a main sub (see takeOver), he swaps with the starter of his
 *   planned slot: he starts in his planned slot in each phase and that starter becomes his
 *   main sub in his own slot; that starter's main subs become auxiliary. Nobody else moves.
 * - as sub: he becomes the main sub for the starter of his planned slot in each phase, and
 *   the main subs who covered that starter become auxiliary subs (see stepIn).
 * With nobody starting in the slot he just starts there (if the XI has room), or is added
 * as an auxiliary sub (main subs only go where a starter plays).
 */
export function signTarget(src: Team, playerId: string, as: SignAs, phase: Phase): Result {
  const p = src.players.find((x) => x.id === playerId);
  if (!p?.target) return { team: src };
  const slots = p.target.slots;
  const team = clone(src);
  delete team.players.find((x) => x.id === playerId)!.target;
  // Start from `phase`, unless only the other phase has a plan, or (as starter) only the
  // other phase's planned slot has a starter to replace (an empty slot would need a 12th).
  const replaceable = (ph: Phase) => !!slots[ph] && !!starterOf(team, ph, slots[ph]!);
  const from = !slots[phase] || (as === 'starter' && !replaceable(phase) && replaceable(other(phase))) ? other(phase) : phase;
  if (!slots[from]) return { team };
  const replaced = as === 'starter' ? starterOf(team, from, slots[from]!)?.playerId ?? null : null;
  if (replaced) return takeOver(src, team, playerId, replaced, (ph) => (slots[ph] ? { slot: slots[ph]! } : undefined));
  return stepIn(src, team, playerId, from, slots, as);
}

/**
 * Makes a main sub a starter by swapping tiers with the starter he replaces (else the starter
 * of his slot), in both phases, without moving anyone else (see takeOver): he starts in his
 * own main sub spot and that starter becomes his main sub in his own slot. A main sub with no
 * starter to swap with just starts in his slot, like a new starter (see stepIn).
 * Auxiliary subs can't be promoted to starter (only to main sub: promoteToMain).
 */
export function promoteToStarter(src: Team, assignmentId: string): Result {
  const a = src.assignments.find((x) => x.id === assignmentId);
  if (!a || a.tier !== 'main' || isStarter(src, a.playerId, a.phase)) return { team: src };
  const x = a.playerId;
  const q = other(a.phase);
  const y = (a.replaces && isStarter(src, a.replaces, a.phase) ? a.replaces : null) ?? starterOf(src, a.phase, a.slot)?.playerId ?? null;
  if (!y) {
    const mains = src.assignments.filter((s) => s.playerId === x && s.phase === q && s.tier === 'main');
    const mirror = mains.find((s) => s.replaces === a.replaces) ?? mains[0];
    const slots = { [a.phase]: a.slot, [q]: mirror?.slot ?? null } as Record<Phase, SlotId | null>;
    return stepIn(src, clone(src), x, a.phase, slots, 'starter');
  }
  const team = clone(src);
  // His main sub spot in each phase: the promoted one, else the one for the same starter.
  return takeOver(src, team, x, y, (ph) => {
    const mine = team.assignments.filter((s) => s.playerId === x && s.phase === ph && s.tier === 'main');
    const s = ph === a.phase ? mine.find((m) => m.id === a.id) : mine.find((m) => m.replaces === y) ?? mine[0];
    return s && { slot: s.slot, a: s };
  });
}

export function upsertPlayer(src: Team, player: Player): Team {
  const team = clone(src);
  const i = team.players.findIndex((p) => p.id === player.id);
  if (i >= 0) team.players[i] = player;
  else team.players.push(player);
  return team;
}

export function removePlayer(src: Team, playerId: string): Team {
  const next = {
    ...src,
    players: src.players.filter((p) => p.id !== playerId),
    assignments: src.assignments.filter((a) => a.playerId !== playerId),
  };
  return normalizeLinks(next);
}

export function emptyTeam(name: string): Team {
  return { id: uid(), name, players: [], assignments: [] };
}

/**
 * A new team that starts as a copy of `src`: same players (positions, remembered roles) and
 * lineups (roles, sub links), with new ids so the two teams never share anything.
 */
export function copyTeam(src: Team, name: string): Team {
  const ids = new Map(src.players.map((p) => [p.id, uid()]));
  const players = src.players.map((p) => ({
    ...p,
    id: ids.get(p.id)!,
    positions: { ip: { ...p.positions.ip }, oop: { ...p.positions.oop } },
    ...(p.roles && { roles: Object.fromEntries(Object.entries(p.roles).map(([ph, bySlot]) => [ph, { ...bySlot }])) }),
    ...(p.target && { target: { ...p.target } }),
  }));
  const assignments = src.assignments.map((a) => ({
    ...a,
    id: uid(),
    playerId: ids.get(a.playerId)!,
    replaces: a.replaces ? ids.get(a.replaces) ?? null : null,
  }));
  return { id: uid(), name, players, assignments };
}
