export type Phase = 'ip' | 'oop';
export type View = 'starters' | 'subs';
export type Tier = 'starter' | 'main' | 'aux';
export type Lang = 'es' | 'en';

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

/** Last role a player had in each pitch slot, per phase (role id or `custom:<text>`). */
export type RoleMemory = Partial<Record<Phase, Partial<Record<SlotId, string>>>>;

/**
 * A transfer target: a player who isn't in the squad yet. He never has lineup assignments;
 * `slots` is where he's planned to play in each phase (null: not planned), and his planned
 * role in each phase is his remembered role for that slot (`Player.roles`).
 */
export interface TargetPlan {
  slots: Record<Phase, SlotId | null>;
}

/** How a signed target joins the lineup at his planned slot. */
export type SignAs = 'starter' | 'sub';

export interface Player {
  id: string;
  name: string;
  positions: Record<Phase, PositionMap>;
  /** Missing until the player is first placed with a role. */
  roles?: RoleMemory;
  /** Present while the player is a transfer target (not yet in the squad). */
  target?: TargetPlan;
}

/**
 * A player placed in a pitch slot for one phase.
 * - starter: one per slot and phase, max 11 per phase, one per player and phase.
 * - main:    main substitute, one per slot and phase; a player can be main sub in many slots.
 * - aux:     extra substitutes, many per slot.
 * `role` is a role id (see roles.ts), `custom:<text>` for a free-text role, or null.
 * `replaces` (subs only) is the id of the starter the sub comes on for, in the same phase. He
 * plays in `slot`, which may be another position. Null for starters, and for a main sub when
 * every starter already has one.
 */
export interface Assignment {
  id: string;
  playerId: string;
  phase: Phase;
  tier: Tier;
  slot: SlotId;
  role: string | null;
  replaces: string | null;
}

export interface Team {
  id: string;
  name: string;
  players: Player[];
  assignments: Assignment[];
}

export interface Settings {
  lang: Lang;
}

export interface AppData {
  version: 3;
  settings: Settings;
  teams: Team[];
  activeTeamId: string;
}
