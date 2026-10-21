import { useMemo, useState } from 'react';
import { mergePositions, SLOT_BY_ID } from '../domain/positions';
import { roleAbbr } from '../domain/roles';
import { matchesQuery } from '../domain/search';
import { isStarter, removePlayer, squadPlayers, targetPlayers } from '../domain/logic';
import type { Assignment, Phase, Player, Team, View } from '../domain/types';
import { useI18n } from '../i18n/I18n';
import { useStore } from '../state/store';
import { useDnd } from './dnd';
import { Icon } from './Icon';
import { ConfirmDialog } from './Modal';
import { shortName } from './names';
import { CopyNameButton, PosBadges } from './PlayerCells';
import { TargetList } from './TargetList';

type Status = 'starters' | 'subs' | 'none';
const STATUSES: Status[] = ['starters', 'subs', 'none'];
const STATUS_LABEL = { starters: 'filterStarters', subs: 'filterSubs', none: 'filterNone' } as const;
type SortKey = 'name' | Phase;

interface Props {
  phase: Phase;
  /** Pitch view: in the subs view, starters of this phase can't be dragged or placed (no starter is a main sub). */
  view: View;
  onAdd: () => void;
  onAddTarget: () => void;
  onEdit: (id: string) => void;
  onPlace: (id: string) => void;
  onSign: (id: string) => void;
  onLoadExample: () => void;
}

type ListKind = 'squad' | 'targets';

const TIER_RANK = { starter: 0, main: 1, aux: 2 } as const;

/** Best tier rank of a player (0 starter … 3 not in the lineup), in one phase or in any. */
function bestTier(team: Team, pid: string, phase?: Phase): number {
  const ranks = team.assignments.filter((a) => a.playerId === pid && (!phase || a.phase === phase)).map((a) => TIER_RANK[a.tier]);
  return ranks.length ? Math.min(...ranks) : 3;
}

export function SquadList({ phase, view, onAdd, onAddTarget, onEdit, onPlace, onSign, onLoadExample }: Props) {
  const { team, updateTeam } = useStore();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [list, setList] = useState<ListKind>('squad');
  const squad = squadPlayers(team);
  const targetCount = targetPlayers(team).length;
  const [removing, setRemoving] = useState<Player | null>(null);
  // One status filter per pitch view, kept for the session: the subs view starts on Subs +
  // Unassigned (the candidates for the bench), and whatever the user picks in a view comes
  // back when they return to it. Statuses combine; all three selected means "All".
  const [filters, setFilters] = useState<Record<View, Status[]>>({ starters: STATUSES, subs: ['subs', 'none'] });
  const filter = filters[view];
  const showAll = filter.length === STATUSES.length;
  const setFilter = (f: Status[]) => setFilters((prev) => ({ ...prev, [view]: f }));
  // From "All", a status shows only that one; otherwise it toggles (none left = All again).
  const toggleStatus = (st: Status) => {
    if (showAll) return setFilter([st]);
    const next = filter.includes(st) ? filter.filter((f) => f !== st) : STATUSES.filter((f) => f === st || filter.includes(f));
    setFilter(next.length ? next : STATUSES);
  };
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: phase, dir: 1 });

  const rows = useMemo(() => {
    const list = squadPlayers(team).filter((p) => {
      if (!matchesQuery(p.name, query)) return false;
      const tier = bestTier(team, p.id);
      return filter.includes(tier === 0 ? 'starters' : tier === 3 ? 'none' : 'subs');
    });
    return list.sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (sort.key === 'name') return byName * sort.dir;
      const ph = sort.key;
      return ((bestTier(team, a.id, ph) - bestTier(team, b.id, ph)) || firstSlotOrder(team, a.id, ph) - firstSlotOrder(team, b.id, ph) || byName) * sort.dir;
    });
  }, [team, query, filter, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none');

  if (team.players.length === 0) {
    return (
      <div className="squad">
        <div className="empty">
          <Icon name="users" size={28} />
          <h2>{t('emptySquadTitle')}</h2>
          <p className="muted">{t('emptySquadText')}</p>
          <div className="empty-actions">
            <button type="button" className="btn btn--primary" onClick={onAdd}>
              <Icon name="userPlus" /> {t('addPlayer')}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onAddTarget}>
              <Icon name="star" /> {t('addTarget')}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onLoadExample}>{t('loadExample')}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="squad">
      <div className="squad-toolbar">
        <h2 className="sr-only">{t(list === 'squad' ? 'squad' : 'targets')}</h2>
        <div className="segmented" role="radiogroup" aria-label={t('list')}>
          {(['squad', 'targets'] as ListKind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={list === k} className="seg" onClick={() => setList(k)}>
              {k === 'targets' && <Icon name="star" size={14} />}
              {t(k)} <span className="count">{k === 'squad' ? squad.length : targetCount}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--primary" onClick={list === 'squad' ? onAdd : onAddTarget}>
          <Icon name="userPlus" /> {t(list === 'squad' ? 'addPlayer' : 'addTarget')}
        </button>
      </div>
      <div className="squad-filters">
        <div className="search grow">
          <Icon name="search" />
          <input className="input" type="search" value={query} placeholder={t('search')} aria-label={t('search')} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {list === 'squad' && <div className="segmented" role="group" aria-label={t('status')}>
          <button type="button" aria-pressed={showAll} className="seg" onClick={() => setFilter(STATUSES)}>{t('filterAll')}</button>
          {STATUSES.map((st) => (
            <button key={st} type="button" aria-pressed={!showAll && filter.includes(st)} className="seg" onClick={() => toggleStatus(st)}>
              {t(STATUS_LABEL[st])}
            </button>
          ))}
        </div>}
      </div>

      {list === 'targets' ? (
        <TargetList query={query} onAdd={onAddTarget} onEdit={onEdit} onPlace={onPlace} onSign={onSign} onClearQuery={() => setQuery('')} />
      ) : squad.length === 0 ? (
        <div className="empty empty--small">
          <p className="muted">{t('emptySquadText')}</p>
          <button type="button" className="btn btn--primary" onClick={onAdd}>
            <Icon name="userPlus" /> {t('addPlayer')}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty empty--small">
          <p className="muted">{t('noMatches')}</p>
          <button type="button" className="btn btn--ghost" onClick={() => { setQuery(''); setFilter(STATUSES); }}>{t('clearFilters')}</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="squad-table">
            <thead>
              <tr>
                <th scope="col" className="col-grip"><span className="sr-only">Drag</span></th>
                <th scope="col" aria-sort={ariaSort('name')}>
                  <button type="button" className="th-btn" onClick={() => toggleSort('name')}>
                    {t('name')} <SortMark active={sort.key === 'name'} dir={sort.dir} />
                  </button>
                </th>
                {(['ip', 'oop'] as Phase[]).map((ph) => (
                  <th key={ph} scope="col" className="col-lineup" aria-sort={ariaSort(ph)}>
                    <button type="button" className="th-btn" onClick={() => toggleSort(ph)} title={`${t('lineup')} · ${t(ph === 'ip' ? 'inPossession' : 'outOfPossession')}`}>
                      {t(ph === 'ip' ? 'inPossession' : 'outOfPossession')} <SortMark active={sort.key === ph} dir={sort.dir} />
                    </button>
                  </th>
                ))}
                <th scope="col">{t('positions')}</th>
                <th scope="col" className="col-actions"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <Row
                  key={p.id}
                  player={p}
                  locked={view === 'subs' && isStarter(team, p.id, phase)}
                  onEdit={onEdit}
                  onPlace={onPlace}
                  onRemove={setRemoving}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {removing && (
        <ConfirmDialog
          message={t('removePlayerConfirm', { name: removing.name })}
          confirmLabel={t('removePlayer')}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            updateTeam((tm) => removePlayer(tm, removing.id));
            setRemoving(null);
          }}
        />
      )}
    </div>
  );
}

function firstSlotOrder(team: Team, pid: string, phase: Phase): number {
  const a = team.assignments.find((x) => x.playerId === pid && x.phase === phase && x.tier !== 'aux');
  if (!a) return 99;
  const def = SLOT_BY_ID[a.slot];
  return (100 - def.y) * 100 + def.x;
}

function SortMark({ active, dir }: { active: boolean; dir: 1 | -1 }) {
  return <span className={`sort-mark${active ? ' sort-mark--on' : ''}`} aria-hidden="true">{active ? (dir === 1 ? '▲' : '▼') : '↕'}</span>;
}

function Row({ player, locked, onEdit, onPlace, onRemove }: {
  player: Player; locked: boolean; onEdit: (id: string) => void; onPlace: (id: string) => void; onRemove: (p: Player) => void;
}) {
  const { team, data } = useStore();
  const { t } = useI18n();
  const { startDrag, dragging } = useDnd();
  const mine = team.assignments.filter((a) => a.playerId === player.id);
  const positions = mergePositions(player.positions.ip, player.positions.oop);

  return (
    <tr
      className={locked ? 'row--locked' : `row-drag${dragging?.playerId === player.id ? ' row--dragging' : ''}`}
      title={locked ? t('starterNotMain') : undefined}
      onPointerDown={(e) => {
        if (locked) return;
        // The grip, the name and the row's empty space drag the player; labels, badges and the
        // other buttons don't. The name still opens the editor on a click (a press without
        // movement isn't a drag). Touch only drags from the grip, so swiping still scrolls.
        const target = e.target as Element;
        const onGrip = !!target.closest('.grip');
        const onHandle = target === e.currentTarget || target.matches('td, th') || !!target.closest('.name-btn');
        if (!onGrip && (e.pointerType === 'touch' || !onHandle)) return;
        startDrag(e, { playerId: player.id, label: shortName(player.name) });
      }}
    >
      <td className="col-grip">
        <span className="grip" aria-hidden="true">
          <Icon name="grip" />
        </span>
      </td>
      <th scope="row" className="col-name">
        <button type="button" className="name-btn" onClick={() => onEdit(player.id)} title={player.name}>
          {player.name}
        </button>
      </th>
      {(['ip', 'oop'] as Phase[]).map((ph) => (
        <td key={ph} className="col-lineup" data-label>
          <span className="cell-label">{t(ph === 'ip' ? 'inPossession' : 'outOfPossession')}</span>
          <LineupCell mine={mine.filter((a) => a.phase === ph)} lang={data.settings.lang} />
        </td>
      ))}
      <td data-label>
        <span className="cell-label">{t('positions')}</span>
        <PosBadges map={positions} />
      </td>
      <td className="col-actions">
        <button
          type="button"
          className="icon-btn"
          title={locked ? t('starterNotMain') : t('place')}
          aria-label={`${t('place')}: ${player.name}`}
          disabled={locked}
          onClick={() => onPlace(player.id)}
        >
          <Icon name="crosshair" />
        </button>
        <CopyNameButton name={player.name} />
        <button type="button" className="icon-btn" title={t('editPlayer')} aria-label={`${t('editPlayer')}: ${player.name}`} onClick={() => onEdit(player.id)}>
          <Icon name="edit" />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--danger"
          title={t('removePlayer')}
          aria-label={`${t('removePlayer')}: ${player.name}`}
          onClick={() => onRemove(player)}
        >
          <Icon name="trash" />
        </button>
      </td>
    </tr>
  );
}

/** One phase of a player's lineup: best tier first, the slot, its role, and +N more places. */
function LineupCell({ mine, lang }: { mine: Assignment[]; lang: 'es' | 'en' }) {
  const { t, pos, posName } = useI18n();
  if (!mine.length) {
    return (
      <span className="muted" title={t('notInLineup')}>
        — <span className="sr-only">{t('notInLineup')}</span>
      </span>
    );
  }
  const list = [...mine].sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
  const first = list[0];
  const extra = list.length - 1;
  return (
    <span className="lineup-line">
      <span
        className={`tier-chip tier-chip--${first.tier}`}
        title={first.tier === 'starter' ? t('starter') : first.tier === 'main' ? t('mainSub') : t('auxSub')}
      >
        {first.tier === 'starter' ? t('tierShortStarter') : first.tier === 'main' ? t('tierShortMain') : t('tierShortAux')}
      </span>
      <span className="lineup-pos" title={posName(SLOT_BY_ID[first.slot].pos)}>{pos(SLOT_BY_ID[first.slot].pos)}</span>
      {first.role && <span className="muted">{roleAbbr(first.role, lang)}</span>}
      {extra > 0 && <span className="muted">+{extra}</span>}
    </span>
  );
}
