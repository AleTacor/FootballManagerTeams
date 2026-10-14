import { canReplace, setReplaces } from '../domain/logic';
import { SLOT_BY_ID, SLOTS } from '../domain/positions';
import type { Assignment } from '../domain/types';
import { useI18n } from '../i18n/I18n';
import { useStore } from '../state/store';
import { linkColors, linkStyle } from './links';

const SLOT_INDEX = new Map(SLOTS.map((s, i) => [s.id, i]));

/**
 * Picks the starter an aux sub replaces (same phase), or nobody, with that starter's link colour beside it.
 * A main sub's starter is fixed (set when he's placed), so it's shown as text.
 */
export function ReplaceSelect({ assignment: a }: { assignment: Assignment }) {
  const { team, updateTeam } = useStore();
  const { t, pos } = useI18n();
  const starters = team.assignments
    .filter((x) => x.phase === a.phase && x.tier === 'starter' && canReplace(team, a.phase, a.slot, a.playerId, x.playerId))
    .sort((x, y) => SLOT_INDEX.get(x.slot)! - SLOT_INDEX.get(y.slot)!);
  const colors = linkColors(team);
  const name = (id: string) => team.players.find((p) => p.id === id)?.name ?? '';
  const label = (id: string) => {
    const slot = starters.find((s) => s.playerId === id)?.slot;
    return t('replacesName', { name: slot ? `${name(id)} (${pos(SLOT_BY_ID[slot].pos)})` : name(id) });
  };

  if (a.tier === 'main') {
    return (
      <div className="replace-select" style={linkStyle(a.replaces ? colors.get(a.replaces) : undefined)}>
        <span className="link-swatch" aria-hidden="true" />
        <span className="replace-fixed truncate">{a.replaces ? label(a.replaces) : t('noStarterToReplace')}</span>
      </div>
    );
  }

  return (
    <div className="replace-select" style={linkStyle(a.replaces ? colors.get(a.replaces) : undefined)}>
      <span className="link-swatch" aria-hidden="true" />
      <select
        className="input"
        value={a.replaces ?? ''}
        aria-label={t('replaces')}
        onChange={(e) => updateTeam((tm) => setReplaces(tm, a.id, e.target.value || null))}
      >
        <option value="">{t('replacesNobody')}</option>
        {starters.map((s) => (
          <option key={s.playerId} value={s.playerId}>{label(s.playerId)}</option>
        ))}
      </select>
    </div>
  );
}
