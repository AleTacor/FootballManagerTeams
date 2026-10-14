import type { CSSProperties } from 'react';
import { SLOTS } from '../domain/positions';
import type { Team } from '../domain/types';

const SLOT_INDEX = new Map(SLOTS.map((s, i) => [s.id, i]));

/**
 * Colour number (1–11, `--link-N` in tokens.css) of each starter, shared by the subs who replace
 * him. Ordered by the starter's in-possession slot so a starter keeps his colour in both phases.
 */
export function linkColors(team: Team): Map<string, number> {
  const starts = new Map<string, number>();
  for (const a of team.assignments) {
    if (a.tier !== 'starter') continue;
    const order = SLOT_INDEX.get(a.slot)! + (a.phase === 'ip' ? 0 : 100);
    starts.set(a.playerId, Math.min(order, starts.get(a.playerId) ?? Infinity));
  }
  const ids = [...starts.keys()].sort((a, b) => starts.get(a)! - starts.get(b)!);
  return new Map(ids.map((id, i) => [id, (i % 11) + 1]));
}

/** Inline style that sets `--link` to a starter's colour token. */
export function linkStyle(n: number | undefined): CSSProperties | undefined {
  return n ? ({ '--link': `var(--link-${n})` } as CSSProperties) : undefined;
}
