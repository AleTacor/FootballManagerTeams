import { useState } from 'react';
import { assignPlayer, removeAssignment, removePlayer, setRole, uid, upsertPlayer, type LogicError } from '../domain/logic';
import { mergePositions, SLOT_BY_ID, SLOT_ORDER } from '../domain/positions';
import type { Phase, Player, PositionMap, SlotId, Tier } from '../domain/types';
import { useI18n } from '../i18n/I18n';
import { useStore } from '../state/store';
import { useSlotLabel } from './slotLabel';
import { ConfirmDialog, Modal } from './Modal';
import { PositionPicker } from './PositionPicker';
import { ReplaceSelect } from './ReplaceSelect';
import { RoleSelect } from './RoleSelect';
import { ScreenshotFill } from './ScreenshotFill';
import { Icon } from './Icon';

interface Props {
  playerId: string | null; // null = new player
  /** Screenshot to read straight away (pasted on the main screen). */
  image?: Blob;
  /** New player as a transfer target (not in the squad yet). */
  asTarget?: boolean;
  onClose: () => void;
  onError: (e: LogicError) => void;
}

export function PlayerEditor({ playerId, image, asTarget, onClose, onError }: Props) {
  const { team, updateTeam } = useStore();
  const { t } = useI18n();
  const existing = playerId ? team.players.find((p) => p.id === playerId) : undefined;
  const isTarget = existing ? !!existing.target : !!asTarget;

  const [name, setName] = useState(existing?.name ?? '');
  // One map for both phases: FM26 positions don't change with the phase, only roles do.
  // Older players with different maps per phase open merged (better familiarity wins).
  const [positions, setPositions] = useState<PositionMap>(
    existing ? mergePositions(existing.positions.ip, existing.positions.oop) : {},
  );
  const both = { ip: positions, oop: positions };
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Positions are optional: a player can be added first and given positions later.
  const save = () => {
    const e: typeof errors = {};
    if (!name.trim()) e.name = t('nameRequired');
    setErrors(e);
    if (e.name) return;
    const player: Player = {
      id: existing?.id ?? uid(),
      name: name.trim(),
      positions: { ip: { ...positions }, oop: { ...positions } },
      ...(existing?.roles && { roles: existing.roles }),
      ...(isTarget && { target: existing?.target ?? { slots: { ip: null, oop: null } } }),
    };
    updateTeam((tm) => upsertPlayer(tm, player));
    onClose();
  };

  if (confirmDelete && existing) {
    return (
      <ConfirmDialog
        message={t(isTarget ? 'removeTargetConfirm' : 'removePlayerConfirm', { name: existing.name })}
        confirmLabel={t(isTarget ? 'removeTarget' : 'removePlayer')}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          updateTeam((tm) => removePlayer(tm, existing.id));
          onClose();
        }}
      />
    );
  }

  return (
    <Modal
      title={t(isTarget ? (existing ? 'editTarget' : 'addTarget') : existing ? 'editPlayer' : 'addPlayer')}
      onClose={onClose}
      footer={
        <>
          {existing && (
            <button type="button" className="btn btn--ghost btn--danger push-left" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" /> {t(isTarget ? 'removeTarget' : 'removePlayer')}
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="btn btn--primary" onClick={save}>{t('save')}</button>
        </>
      }
    >
      <ScreenshotFill
        initial={image}
        onResult={(r) => {
          if (r.name) {
            setName(r.name);
            setErrors({});
          }
          if (r.positions && Object.keys(r.positions).length) {
            setPositions({ ...r.positions });
          }
        }}
      />

      <div className="field">
        <label htmlFor="player-name" className="label">{t('name')}</label>
        <input
          id="player-name"
          className="input"
          value={name}
          maxLength={80}
          placeholder={t('namePlaceholder')}
          autoFocus
          aria-invalid={!!errors.name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        {errors.name && <p className="error-text">{errors.name}</p>}
      </div>

      <div className="field">
        <span className="label">
          {t('positions')} <span className="count">{Object.keys(positions).length}</span>
        </span>
        <PositionPicker idPrefix="fam" value={positions} onChange={setPositions} />
      </div>

      {existing && !isTarget && <AssignmentsEditor player={existing} positions={both} onError={onError} />}
    </Modal>
  );
}

function AssignmentsEditor({ player, positions, onError }: { player: Player; positions: Record<Phase, PositionMap>; onError: (e: LogicError) => void }) {
  const { team, updateTeam } = useStore();
  const { t } = useI18n();
  const slotLabel = useSlotLabel();
  const mine = team.assignments
    .filter((a) => a.playerId === player.id)
    .sort((a, b) => a.phase.localeCompare(b.phase) || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));

  const [phase, setPhase] = useState<Phase>('ip');
  const [tier, setTier] = useState<Tier>('starter');
  const playable = SLOT_ORDER.filter((s) => positions[phase][SLOT_BY_ID[s].pos]);
  const [slot, setSlot] = useState<SlotId | ''>('');
  const slotValue = slot && (playable.includes(slot) || !playable.length) ? slot : playable[0] ?? '';

  const tierLabel = (tr: Tier) => t(tr === 'starter' ? 'starter' : tr === 'main' ? 'mainSub' : 'auxSub');

  const add = () => {
    if (!slotValue) return;
    let error: LogicError | undefined;
    updateTeam((tm) => {
      const r = assignPlayer(tm, player.id, phase, slotValue, tier);
      error = r.error;
      return r.team;
    });
    if (error) onError(error);
  };

  return (
    <section className="field">
      <span className="label">{t('assignments')}</span>
      {mine.length === 0 ? (
        <p className="muted small">{t('notInLineup')}</p>
      ) : (
        <ul className="assign-table">
          {mine.map((a) => (
            <li key={a.id} className="assign-row">
              <span className="phase-chip" title={t(a.phase === 'ip' ? 'inPossession' : 'outOfPossession')}>{t(a.phase === 'ip' ? 'ipShort' : 'oopShort')}</span>
              <span className={`tier-chip tier-chip--${a.tier}`}>{tierLabel(a.tier)}</span>
              <span className="assign-pos">{slotLabel(a.slot)}</span>
              <RoleSelect
                phase={a.phase}
                pos={SLOT_BY_ID[a.slot].pos}
                value={a.role}
                onChange={(role) => updateTeam((tm) => setRole(tm, a.id, role))}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={`${t('removeFromPosition')}: ${slotLabel(a.slot)}`}
                onClick={() => updateTeam((tm) => removeAssignment(tm, a.id))}
              >
                <Icon name="trash" />
              </button>
              {a.tier !== 'starter' && <ReplaceSelect assignment={a} />}
            </li>
          ))}
        </ul>
      )}
      <div className="assign-add">
        <select className="input" value={phase} aria-label={t('phase')} onChange={(e) => setPhase(e.target.value as Phase)}>
          <option value="ip">{t('inPossession')}</option>
          <option value="oop">{t('outOfPossession')}</option>
        </select>
        <select className="input" value={tier} aria-label={t('tier')} onChange={(e) => setTier(e.target.value as Tier)}>
          {(['starter', 'main', 'aux'] as Tier[]).map((tr) => (
            <option key={tr} value={tr}>{tierLabel(tr)}</option>
          ))}
        </select>
        <select
          className="input"
          value={slotValue}
          aria-label={t('position')}
          onChange={(e) => setSlot(e.target.value as SlotId)}
          disabled={!playable.length}
        >
          {playable.map((s) => (
            <option key={s} value={s}>{slotLabel(s)}</option>
          ))}
        </select>
        <button type="button" className="btn" onClick={add} disabled={!slotValue}>
          <Icon name="plus" /> {t('add')}
        </button>
      </div>
    </section>
  );
}
