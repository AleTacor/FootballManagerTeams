import { FAMILIARITY_RANK, SLOT_BY_ID, SLOTS } from './positions';
import { defaultRole, roleFits } from './roles';
import type { Assignment, Familiarity, Phase, Player, SlotId, Team, Tier } from './types';

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
  }));
  const assignments = src.assignments.map((a) => ({
    ...a,
    id: uid(),
    playerId: ids.get(a.playerId)!,
    replaces: a.replaces ? ids.get(a.replaces) ?? null : null,
  }));
  return { id: uid(), name, players, assignments };
}
