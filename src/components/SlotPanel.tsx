import { useMemo, useState } from 'react';
import {
  assignPlayer, auxOf, canPlay, familiarityAt, isStarter, mainOf, promoteToMain, removeAssignment,
  setRole, sortByFamiliarity, starterOf, type LogicError,
} from '../domain/logic';
import { SLOT_BY_ID } from '../domain/positions';
import { matchesQuery } from '../domain/search';
import type { Assignment, Phase, PosCode, SlotId, Team, Tier, View } from '../domain/types';
import { useI18n } from '../i18n/I18n';
import { useStore } from '../state/store';
import { FamDot } from './FamDot';
import { Icon } from './Icon';
import { ReplaceSelect } from './ReplaceSelect';
import { RoleSelect } from './RoleSelect';
import { Sheet } from './Sheet';
import type { StringKey } from '../i18n/strings';

interface Props {
  phase: Phase;
  view: View;
  slot: SlotId;
  onClose: () => void;
  onError: (e: LogicError) => void;
}

function statusLabel(team: Team, playerId: string, phase: Phase, t: (k: StringKey) => string, pos: (c: PosCode) => string): string {
  const mine = team.assignments.filter((a) => a.playerId === playerId && a.phase === phase);
  const st = mine.find((a) => a.tier === 'starter');
  if (st) return `${t('starter')} · ${pos(SLOT_BY_ID[st.slot].pos)}`;
  const main = mine.find((a) => a.tier === 'main');
  if (main) return `${t('mainSub')} · ${pos(SLOT_BY_ID[main.slot].pos)}`;
  if (mine.length) return `${t('auxSub')} · ${pos(SLOT_BY_ID[mine[0].slot].pos)}`;
  return '';
}

export function SlotPanel({ phase, view, slot, onClose, onError }: Props) {
  const { team, updateTeam } = useStore();
  const { t, pos } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const def = SLOT_BY_ID[slot];

  const starter = starterOf(team, phase, slot);
  const main = mainOf(team, phase, slot);
  const aux = auxOf(team, phase, slot);
  const tier: Tier = view === 'starters' ? 'starter' : 'main';

  const assignedIds = new Set(
    // In the subs view the slot's own starter can't be its substitute.
    (view === 'starters' ? [starter] : [starter, main, ...aux]).filter(Boolean).map((a) => a!.playerId),
  );

  const candidates = useMemo(() => {
    const list = team.players.filter(
      (p) => !assignedIds.has(p.id) && (showAll || canPlay(p, phase, slot)) && matchesQuery(p.name, query),
    );
    return sortByFamiliarity(list, phase, slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, phase, slot, showAll, query, view]);

  const assign = (playerId: string, as: Tier) => {
    let error: LogicError | undefined;
    updateTeam((tm) => {
      const r = assignPlayer(tm, playerId, phase, slot, as);
      error = r.error;
      return r.team;
    });
    if (error) onError(error);
  };

  const title = `${pos(def.pos)}`;
  const subtitle = `${t(phase === 'ip' ? 'inPossession' : 'outOfPossession')} · ${t(view === 'starters' ? 'starters' : 'subs')}`;

  const assignedRows: Assignment[] = view === 'starters' ? (starter ? [starter] : []) : [main, ...aux].filter((a): a is Assignment => !!a);

  return (
    <Sheet title={title} subtitle={subtitle} onClose={onClose}>
      <section className="panel-section">
        <h3 className="section-title">{t('assigned')}</h3>
        {assignedRows.length === 0 ? (
          <p className="muted">{view === 'subs' && starter ? t('noSub') : t('nobodyAssigned')}</p>
        ) : (
          <ul className="assigned-list">
            {assignedRows.map((a) => {
              const p = team.players.find((x) => x.id === a.playerId);
              return (
                <li key={a.id} className="assigned-row">
                  <div className="assigned-head">
                    <FamDot level={familiarityAt(p, phase, slot)} />
                    <span className="grow truncate strong">{p?.name}</span>
                    {view === 'subs' && (
                      <span className={`tier-chip tier-chip--${a.tier}`}>{a.tier === 'main' ? t('mainSub') : t('aux')}</span>
                    )}
                  </div>
                  <div className="assigned-controls">
                    <RoleSelect
                      phase={phase}
                      pos={def.pos}
                      value={a.role}
                      onChange={(role) => updateTeam((tm) => setRole(tm, a.id, role))}
                    />
                    {a.tier !== 'starter' && <ReplaceSelect assignment={a} />}
                    {a.tier === 'aux' && !!starter && !isStarter(team, a.playerId, phase) && (
                      <button type="button" className="btn btn--ghost" onClick={() => updateTeam((tm) => promoteToMain(tm, a.id))}>
                        <Icon name="arrowUp" /> {t('makeMain')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--ghost btn--danger"
                      onClick={() => updateTeam((tm) => removeAssignment(tm, a.id))}
                    >
                      <Icon name="x" /> {t('removeFromPosition')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel-section">
        <h3 className="section-title">{t('candidates')}</h3>
        <div className="search">
          <Icon name="search" />
          <input
            className="input"
            type="search"
            value={query}
            placeholder={t('search')}
            aria-label={t('search')}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label className="check">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          {t('showAll')}
        </label>
        {candidates.length === 0 ? (
          <p className="muted">{t('noCandidates')}</p>
        ) : (
          <ul className="candidate-list">
            {candidates.map((p) => {
              const st = statusLabel(team, p.id, phase, t, pos);
              // A starter can't be a main sub: in the subs view he can only be added as aux.
              const locked = tier === 'main' && isStarter(team, p.id, phase);
              return (
                <li key={p.id} className={`candidate${locked ? ' candidate--locked' : ''}`}>
                  <button
                    type="button"
                    className="candidate-main"
                    onClick={() => assign(p.id, tier)}
                    disabled={locked}
                    title={locked ? t('starterNotMain') : undefined}
                  >
                    <FamDot level={familiarityAt(p, phase, slot)} />
                    <span className="grow min0">
                      <span className="truncate block">{p.name}</span>
                      <span className="muted small truncate block">{st || t('notInLineup')}</span>
                    </span>
                  </button>
                  {view === 'subs' && (
                    <button
                      type="button"
                      className="icon-btn"
                      title={t('addAsAux')}
                      aria-label={`${t('addAsAux')}: ${p.name}`}
                      onClick={() => assign(p.id, 'aux')}
                    >
                      <Icon name="plus" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Sheet>
  );
}
