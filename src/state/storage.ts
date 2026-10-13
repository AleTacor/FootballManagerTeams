import { emptyTeam } from '../domain/logic';
import { FAMILIARITY_LEVELS, POS_CODES, SLOT_BY_ID } from '../domain/positions';
import type { AppData, Assignment, Familiarity, Lang, Phase, Player, PositionMap, Team } from '../domain/types';

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
  return { version: 1, settings: { lang, theme: 'dark' }, teams: [team], activeTeamId: team.id };
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

function parsePlayer(v: unknown): Player | null {
  if (!isObj(v) || !str(v.id) || !str(v.name)) return null;
  const pos = isObj(v.positions) ? v.positions : {};
  return { id: v.id, name: v.name.slice(0, 80), positions: { ip: parsePositions(pos.ip), oop: parsePositions(pos.oop) } };
}

function parseAssignment(v: unknown, playerIds: Set<string>): Assignment | null {
  if (!isObj(v) || !str(v.id) || !str(v.playerId) || !playerIds.has(v.playerId)) return null;
  const phase = v.phase === 'ip' || v.phase === 'oop' ? (v.phase as Phase) : null;
  const tier = v.tier === 'starter' || v.tier === 'main' || v.tier === 'aux' ? v.tier : null;
  if (!phase || !tier || !str(v.slot) || !(v.slot in SLOT_BY_ID)) return null;
  return {
    id: v.id,
    playerId: v.playerId,
    phase,
    tier,
    slot: v.slot as Assignment['slot'],
    role: typeof v.role === 'string' && v.role ? v.role.slice(0, 80) : null,
  };
}

function parseTeam(v: unknown): Team | null {
  if (!isObj(v) || !str(v.id) || !str(v.name)) return null;
  const players = (Array.isArray(v.players) ? v.players : []).map(parsePlayer).filter((p): p is Player => !!p);
  const ids = new Set(players.map((p) => p.id));
  const assignments = (Array.isArray(v.assignments) ? v.assignments : [])
    .map((a) => parseAssignment(a, ids))
    .filter((a): a is Assignment => !!a);
  return { id: v.id, name: v.name.slice(0, 60), players, assignments };
}

export function parseData(v: unknown): AppData | null {
  if (!isObj(v) || v.version !== 1 || !Array.isArray(v.teams)) return null;
  const teams = v.teams.map(parseTeam).filter((t): t is Team => !!t);
  if (teams.length === 0) return null;
  const s = isObj(v.settings) ? v.settings : {};
  const lang: Lang = s.lang === 'en' || s.lang === 'es' ? s.lang : defaultLang();
  const theme = s.theme === 'light' ? 'light' : 'dark';
  const activeTeamId = teams.some((t) => t.id === v.activeTeamId) ? (v.activeTeamId as string) : teams[0].id;
  return { version: 1, settings: { lang, theme }, teams, activeTeamId };
}
