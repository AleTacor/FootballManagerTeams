import { SLOTS, SLOT_BY_ID } from '../domain/positions';
import type { SlotId } from '../domain/types';
import { useI18n } from '../i18n/I18n';

const SIDE: Record<'es' | 'en', Record<'L' | 'C' | 'R', string>> = {
  en: { L: 'left', C: 'centre', R: 'right' },
  es: { L: 'izq.', C: 'centro', R: 'der.' },
};

/** "D (C) · left" for positions that have several slots; plain "GK" otherwise. */
export function useSlotLabel() {
  const { pos, lang } = useI18n();
  return (slot: SlotId) => {
    const def = SLOT_BY_ID[slot];
    const siblings = SLOTS.filter((s) => s.pos === def.pos);
    if (siblings.length < 2) return pos(def.pos);
    const side = def.x < 45 ? 'L' : def.x > 55 ? 'R' : 'C';
    return `${pos(def.pos)} · ${SIDE[lang][side]}`;
  };
}
