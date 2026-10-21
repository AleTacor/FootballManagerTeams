import { useState } from 'react';
import { mergePositions, SLOT_BY_ID } from '../domain/positions';
import { roleAbbr, roleName } from '../domain/roles';
import { removePlayer, targetPlayers } from '../domain/logic';
import { matchesQuery } from '../domain/search';
import type { Phase, Player } from '../domain/types';
import { useI18n } from '../i18n/I18n';
import { useStore } from '../state/store';
import { useDnd } from './dnd';
import { Icon } from './Icon';
import { ConfirmDialog } from './Modal';
import { shortName } from './names';
import { CopyNameButton, PosBadges } from './PlayerCells';

interface Props {
  query: string;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onPlace: (id: string) => void;
  onSign: (id: string) => void;
  onClearQuery: () => void;
}

/** Transfer targets: players you could sign, each with a planned position and role per phase. */
export function TargetList({ query, onAdd, onEdit, onPlace, onSign, onClearQuery }: Props) {
  const { team, updateTeam } = useStore();
  const { t } = useI18n();
  const [removing, setRemoving] = useState<Player | null>(null);
  const all = targetPlayers(team);
  const rows = all.filter((p) => matchesQuery(p.name, query)).sort((a, b) => a.name.localeCompare(b.name));

  if (!all.length) {
    return (
      <div className="empty empty--small">
        <Icon name="star" size={28} />
        <h2>{t('emptyTargetsTitle')}</h2>
        <p className="muted">{t('emptyTargetsText')}</p>
        <button type="button" className="btn btn--primary" onClick={onAdd}>
          <Icon name="userPlus" /> {t('addTarget')}
        </button>
      </div>
    );
  }

  return (
    <>
      {rows.length === 0 ? (
        <div className="empty empty--small">
          <p className="muted">{t('noMatches')}</p>
          <button type="button" className="btn btn--ghost" onClick={onClearQuery}>{t('clearFilters')}</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="squad-table">
            <thead>
              <tr>
                <th scope="col" className="col-grip"><span className="sr-only">Drag</span></th>
                <th scope="col">{t('name')}</th>
                {(['ip', 'oop'] as Phase[]).map((ph) => (
                  <th key={ph} scope="col" className="col-lineup" title={t('plannedIn', { phase: t(ph === 'ip' ? 'inPossession' : 'outOfPossession') })}>
                    {t(ph === 'ip' ? 'inPossession' : 'outOfPossession')}
                  </th>
                ))}
                <th scope="col">{t('positions')}</th>
                <th scope="col" className="col-actions"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <TargetRow key={p.id} player={p} onEdit={onEdit} onPlace={onPlace} onSign={onSign} onRemove={setRemoving} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {removing && (
        <ConfirmDialog
          message={t('removeTargetConfirm', { name: removing.name })}
          confirmLabel={t('removeTarget')}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            updateTeam((tm) => removePlayer(tm, removing.id));
            setRemoving(null);
          }}
        />
      )}
    </>
  );
}

function TargetRow({ player, onEdit, onPlace, onSign, onRemove }: {
  player: Player; onEdit: (id: string) => void; onPlace: (id: string) => void; onSign: (id: string) => void; onRemove: (p: Player) => void;
}) {
  const { data } = useStore();
  const { t, pos, posName } = useI18n();
  const { startDrag, dragging } = useDnd();
  const lang = data.settings.lang;

  return (
    <tr
      className={`row-drag${dragging?.playerId === player.id ? ' row--dragging' : ''}`}
      onPointerDown={(e) => {
        // Same drag handles as the squad rows: dropping on a slot plans the target there.
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
      {(['ip', 'oop'] as Phase[]).map((ph) => {
        const slot = player.target?.slots[ph] ?? null;
        const role = slot ? player.roles?.[ph]?.[slot] ?? null : null;
        return (
          <td key={ph} className="col-lineup" data-label>
            <span className="cell-label">{t('plannedIn', { phase: t(ph === 'ip' ? 'inPossession' : 'outOfPossession') })}</span>
            {slot ? (
              <span className="lineup-line">
                <span className="target-chip" title={t('targets')}><Icon name="star" size={12} /></span>
                <span className="lineup-pos" title={posName(SLOT_BY_ID[slot].pos)}>{pos(SLOT_BY_ID[slot].pos)}</span>
                {role && <span className="muted" title={roleName(role, lang)}>{roleAbbr(role, lang)}</span>}
              </span>
            ) : (
              <span className="muted" title={t('notPlanned')}>
                — <span className="sr-only">{t('notPlanned')}</span>
              </span>
            )}
          </td>
        );
      })}
      <td data-label>
        <span className="cell-label">{t('positions')}</span>
        <PosBadges map={mergePositions(player.positions.ip, player.positions.oop)} />
      </td>
      <td className="col-actions">
        <button type="button" className="icon-btn" title={t('place')} aria-label={`${t('place')}: ${player.name}`} onClick={() => onPlace(player.id)}>
          <Icon name="crosshair" />
        </button>
        <button type="button" className="icon-btn" title={t('sign')} aria-label={`${t('sign')}: ${player.name}`} onClick={() => onSign(player.id)}>
          <Icon name="userCheck" />
        </button>
        <CopyNameButton name={player.name} />
        <button type="button" className="icon-btn" title={t('editTarget')} aria-label={`${t('editTarget')}: ${player.name}`} onClick={() => onEdit(player.id)}>
          <Icon name="edit" />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--danger"
          title={t('removeTarget')}
          aria-label={`${t('removeTarget')}: ${player.name}`}
          onClick={() => onRemove(player)}
        >
          <Icon name="trash" />
        </button>
      </td>
    </tr>
  );
}
