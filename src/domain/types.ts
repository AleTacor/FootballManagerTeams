export type Phase = 'ip' | 'oop';
export type View = 'starters' | 'subs';
export type Tier = 'starter' | 'main' | 'aux';
export type Lang = 'es' | 'en';
export type Theme = 'dark' | 'light';

/** Positions a player can be familiar with (FM position codes). */
export type PosCode =
  | 'GK' | 'DL' | 'DC' | 'DR' | 'WBL' | 'WBR' | 'DM'
  | 'ML' | 'MC' | 'MR' | 'AML' | 'AMC' | 'AMR' | 'ST';

/** Concrete spots on the tactics pitch (several spots share one PosCode). */
export type SlotId =
  | 'GK'
  | 'DL' | 'DCL' | 'DCC' | 'DCR' | 'DR'
  | 'WBL' | 'DML' | 'DMC' | 'DMR' | 'WBR'
  | 'ML' | 'MCL' | 'MCC' | 'MCR' | 'MR'
  | 'AML' | 'AMCL' | 'AMCC' | 'AMCR' | 'AMR'
  | 'STL' | 'STC' | 'STR';

/** FM position familiarity, from best to worst. "unknown" = can play, level not recorded. */
export type Familiarity =
  | 'natural' | 'accomplished' | 'competent'
  | 'unconvincing' | 'awkward' | 'ineffectual' | 'unknown';

export type PositionMap = Partial<Record<PosCode, Familiarity>>;

export interface Player {
  id: string;
  name: string;
  positions: Record<Phase, PositionMap>;
}

/**
 * A player placed in a pitch slot for one phase.
 * - starter: one per slot and phase, max 11 per phase, one per player and phase.
 * - main:    main substitute, one per slot and phase; a player can be main sub in many slots.
 * - aux:     extra substitutes, many per slot.
 * `role` is a role id (see roles.ts), `custom:<text>` for a free-text role, or null.
 */
export interface Assignment {
  id: string;
  playerId: string;
  phase: Phase;
  tier: Tier;
  slot: SlotId;
  role: string | null;
}

export interface Team {
  id: string;
  name: string;
  players: Player[];
  assignments: Assignment[];
}

export interface Settings {
  lang: Lang;
  theme: Theme;
}

export interface AppData {
  version: 1;
  settings: Settings;
  teams: Team[];
  activeTeamId: string;
}
