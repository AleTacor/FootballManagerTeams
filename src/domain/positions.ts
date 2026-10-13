import type { Familiarity, PosCode, PositionMap, SlotId } from './types';

export const POS_CODES: PosCode[] = [
  'GK', 'DL', 'DC', 'DR', 'WBL', 'WBR', 'DM', 'ML', 'MC', 'MR', 'AML', 'AMC', 'AMR', 'ST',
];

export type PosGroup = 'gk' | 'def' | 'mid' | 'att';

export const POS_GROUP: Record<PosCode, PosGroup> = {
  GK: 'gk',
  DL: 'def', DC: 'def', DR: 'def', WBL: 'def', WBR: 'def',
  DM: 'mid', ML: 'mid', MC: 'mid', MR: 'mid',
  AML: 'att', AMC: 'att', AMR: 'att', ST: 'att',
};

export interface SlotDef {
  id: SlotId;
  pos: PosCode;
  /** % from the left of the pitch */
  x: number;
  /** % from the top of the pitch (attack goes up) */
  y: number;
}

const COLS = { L: 11, CL: 30.5, C: 50, CR: 69.5, R: 89 };
const ROWS = { ST: 11, AM: 28, M: 46, DM: 63, D: 78.5, GK: 92 };

export const SLOTS: SlotDef[] = [
  { id: 'STL', pos: 'ST', x: COLS.CL, y: ROWS.ST },
  { id: 'STC', pos: 'ST', x: COLS.C, y: ROWS.ST },
  { id: 'STR', pos: 'ST', x: COLS.CR, y: ROWS.ST },
  { id: 'AML', pos: 'AML', x: COLS.L, y: ROWS.AM },
  { id: 'AMCL', pos: 'AMC', x: COLS.CL, y: ROWS.AM },
  { id: 'AMCC', pos: 'AMC', x: COLS.C, y: ROWS.AM },
  { id: 'AMCR', pos: 'AMC', x: COLS.CR, y: ROWS.AM },
  { id: 'AMR', pos: 'AMR', x: COLS.R, y: ROWS.AM },
  { id: 'ML', pos: 'ML', x: COLS.L, y: ROWS.M },
  { id: 'MCL', pos: 'MC', x: COLS.CL, y: ROWS.M },
  { id: 'MCC', pos: 'MC', x: COLS.C, y: ROWS.M },
  { id: 'MCR', pos: 'MC', x: COLS.CR, y: ROWS.M },
  { id: 'MR', pos: 'MR', x: COLS.R, y: ROWS.M },
  { id: 'WBL', pos: 'WBL', x: COLS.L, y: ROWS.DM },
  { id: 'DML', pos: 'DM', x: COLS.CL, y: ROWS.DM },
  { id: 'DMC', pos: 'DM', x: COLS.C, y: ROWS.DM },
  { id: 'DMR', pos: 'DM', x: COLS.CR, y: ROWS.DM },
  { id: 'WBR', pos: 'WBR', x: COLS.R, y: ROWS.DM },
  { id: 'DL', pos: 'DL', x: COLS.L, y: ROWS.D },
  { id: 'DCL', pos: 'DC', x: COLS.CL, y: ROWS.D },
  { id: 'DCC', pos: 'DC', x: COLS.C, y: ROWS.D },
  { id: 'DCR', pos: 'DC', x: COLS.CR, y: ROWS.D },
  { id: 'DR', pos: 'DR', x: COLS.R, y: ROWS.D },
  { id: 'GK', pos: 'GK', x: COLS.C, y: ROWS.GK },
];

export const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s])) as Record<SlotId, SlotDef>;

/** Order used to draw the position picker as a mini pitch (top = attack). */
export const POS_GRID: (PosCode | null)[][] = [
  [null, null, 'ST', null, null],
  ['AML', null, 'AMC', null, 'AMR'],
  ['ML', null, 'MC', null, 'MR'],
  ['WBL', null, 'DM', null, 'WBR'],
  ['DL', null, 'DC', null, 'DR'],
  [null, null, 'GK', null, null],
];

/** Best first. Unknown sits after "competent": the player can play there, level not recorded. */
export const FAMILIARITY_LEVELS: Familiarity[] = [
  'natural', 'accomplished', 'competent', 'unconvincing', 'awkward', 'ineffectual', 'unknown',
];

export const FAMILIARITY_RANK: Record<Familiarity, number> = {
  natural: 0, accomplished: 1, competent: 2, unknown: 3, unconvincing: 4, awkward: 5, ineffectual: 6,
};

/**
 * One position map from a player's two phases: every position in either, at the better
 * familiarity. The editor shows a single map (FM26 positions don't depend on the phase).
 */
export function mergePositions(a: PositionMap, b: PositionMap): PositionMap {
  const out: PositionMap = {};
  for (const code of POS_CODES) {
    const fa = a[code], fb = b[code];
    const best = fa && fb ? (FAMILIARITY_RANK[fb] < FAMILIARITY_RANK[fa] ? fb : fa) : fa ?? fb;
    if (best) out[code] = best;
  }
  return out;
}

/** Display order of slots in lists (defence → attack). */
export const SLOT_ORDER: SlotId[] = [...SLOTS].reverse().map((s) => s.id);
