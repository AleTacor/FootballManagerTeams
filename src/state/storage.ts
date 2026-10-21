import { emptyTeam, linkLineup } from '../domain/logic';
import { FAMILIARITY_LEVELS, POS_CODES, SLOT_BY_ID, SLOTS } from '../domain/positions';
import { defaultRole, roleFits } from '../domain/roles';
import type { AppData, Assignment, Familiarity, Lang, Phase, Player, PositionMap, RoleMemory, SlotId, TargetPlan, Team } from '../domain/types';

export const STORAGE_KEY = 'fm-teams:v1';

function defaultLang(): Lang {
  try {
    return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
  } catch {
    return 'es';
  }
}

export function defaultData(): AppData {
  const lang = defaultLang();
  const team = emptyTeam(lang === 'es' ? 'Mi equipo' : 'My team');
  return { version: 3, settings: { lang }, teams: [team], activeTeamId: team.id };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    return parseData(JSON.parse(raw)) ?? defaultData();
  } catch {
    return defaultData();
  }
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage full or blocked: the app keeps working in memory */
  }
}

export function exportData(data: AppData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `fm-teams-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- validation: never trust a file or old storage ---------- */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function parsePositions(v: unknown): PositionMap {
  const out: PositionMap = {};
  if (!isObj(v)) return out;
  for (const code of POS_CODES) {
    const f = v[code];
    if (typeof f === 'string' && (FAMILIARITY_LEVELS as string[]).includes(f)) out[code] = f as Familiarity;
  }
  return out;
}

const PHASES: Phase[] = ['ip', 'oop'];

function parseRoles(v: unknown): RoleMemory | null {
  if (!isObj(v)) return null;
  const out: RoleMemory = {};
  for (const phase of PHASES) {
    const bySlot = v[phase];
    if (!isObj(bySlot)) continue;
    for (const slot of SLOTS) {
      const role = bySlot[slot.id];
      if (!str(role)) continue;
      const clean = role.slice(0, 80);
      if (roleFits(clean, slot.pos, phase)) (out[phase] ??= {})[slot.id] = clean;
    }
  }
  return Object.keys(out).length ? out : null;
}

const slotOrNull = (v: unknown): SlotId | null => (str(v) && v in SLOT_BY_ID ? (v as SlotId) : null);

/** v3: transfer target plan, one slot per phase. A first draft stored one `slot` for both. */
function parseTarget(v: unknown): TargetPlan | null {
  if (!isObj(v)) return null;
  if (isObj(v.slots)) return { slots: { ip: slotOrNull(v.slots.ip), oop: slotOrNull(v.slots.oop) } };
  const slot = slotOrNull(v.slot);
  return { slots: { ip: slot, oop: slot } };
}

function parsePlayer(v: unknown): Player | null {
  if (!isObj(v) || !str(v.id) || !str(v.name)) return null;
  const pos = isObj(v.positions) ? v.positions : {};
  const roles = parseRoles(v.roles);
  const target = parseTarget(v.target);
  return {
    id: v.id,
    name: v.name.slice(0, 80),
    positions: { ip: parsePositions(pos.ip), oop: parsePositions(pos.oop) },
    ...(roles && { roles }),
    ...(target && { target }),
  };
}

/** v1 → v2: v1 had no role memory, so each player remembers the roles of his current assignments. */
function seedRoles(team: Team): Team {
  const players = team.players.map((p) => {
    const roles: RoleMemory = {};
    for (const a of team.assignments) {
      if (a.playerId !== p.id || !a.role) continue;
      (roles[a.phase] ??= {})[a.slot] = a.role;
    }
    return Object.keys(roles).length ? { ...p, roles } : p;
  });
  return { ...team, players };
}

function parseAssignment(v: unknown, playerIds: Set<string>): Assignment | null {
  if (!isObj(v) || !str(v.id) || !str(v.playerId) || !playerIds.has(v.playerId)) return null;
  const phase = v.phase === 'ip' || v.phase === 'oop' ? (v.phase as Phase) : null;
  const tier = v.tier === 'starter' || v.tier === 'main' || v.tier === 'aux' ? v.tier : null;
  if (!phase || !tier || !str(v.slot) || !(v.slot in SLOT_BY_ID)) return null;
  const pos = SLOT_BY_ID[v.slot as SlotId].pos;
  const role = typeof v.role === 'string' && v.role ? v.role.slice(0, 80) : null;
  return {
    id: v.id,
    playerId: v.playerId,
    phase,
    tier,
    slot: v.slot as Assignment['slot'],
    // A role the position no longer has (the role lists changed) falls back to its default.
    role: role && !roleFits(role, pos, phase) ? defaultRole(pos, phase) : role,
    // Checked against the lineup (must start in that phase) by linkLineup in parseTeam.
    replaces: tier !== 'starter' && str(v.replaces) && playerIds.has(v.replaces) ? v.replaces : null,
  };
}

function parseTeam(v: unknown): Team | null {
  if (!isObj(v) || !str(v.id) || !str(v.name)) return null;
  const players = (Array.isArray(v.players) ? v.players : []).map(parsePlayer).filter((p): p is Player => !!p);
  const ids = new Set(players.map((p) => p.id));
  const assignments = (Array.isArray(v.assignments) ? v.assignments : [])
    .map((a) => parseAssignment(a, ids))
    .filter((a): a is Assignment => !!a);
  // Older data may have starters or main subs in one phase only, starters who are main subs,
  // or subs without the starter they replace: linkLineup fixes all of it.
  return linkLineup({ id: v.id, name: v.name.slice(0, 60), players, assignments });
}

export function parseData(v: unknown): AppData | null {
  // v1 had no role memory and v2 no transfer targets; both still import.
  if (!isObj(v) || (v.version !== 1 && v.version !== 2 && v.version !== 3) || !Array.isArray(v.teams)) return null;
  let teams = v.teams.map(parseTeam).filter((t): t is Team => !!t);
  if (v.version === 1) teams = teams.map(seedRoles);
  if (teams.length === 0) return null;
  const s = isObj(v.settings) ? v.settings : {};
  const lang: Lang = s.lang === 'en' || s.lang === 'es' ? s.lang : defaultLang();
  const activeTeamId = teams.some((t) => t.id === v.activeTeamId) ? (v.activeTeamId as string) : teams[0].id;
  // An old `theme` setting is ignored: the app only has the dark theme.
  return { version: 3, settings: { lang }, teams, activeTeamId };
}
