import { useEffect, useRef, useState } from 'react';
import { auxOf, familiarityAt, isStarter, mainOf, removeAssignment, starterOf } from '../domain/logic';
import { POS_GROUP, SLOTS, type SlotDef } from '../domain/positions';
import { roleAbbr, roleName } from '../domain/roles';
import type { Assignment, Phase, Player, SlotId, View } from '../domain/types';
import { useI18n } from '../i18n/I18n';
import { useStore } from '../state/store';
import { useDnd } from './dnd';
import { FamDot } from './FamDot';
import { Icon } from './Icon';

interface Props {
  phase: Phase;
  view: View;
  selectedSlot: SlotId | null;
  targeting: boolean;
  onSlotClick: (slot: SlotId) => void;
}

export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

export function Pitch({ phase, view, selectedSlot, targeting, onSlotClick }: Props) {
  const { t } = useI18n();
  const { dragging } = useDnd();
  const [plusSlot, setPlusSlot] = useState<SlotId | null>(null);

  useEffect(() => setPlusSlot(null), [phase, view]);

  return (
    <div
      className={`pitch${dragging || targeting ? ' pitch--targeting' : ''}`}
      role="group"
      aria-label={`${t(view === 'starters' ? 'starters' : 'subs')} · ${t(phase === 'ip' ? 'inPossession' : 'outOfPossession')}`}
    >
      <PitchMarkings />
      {SLOTS.map((s) => (
        <SlotNode
          key={s.id}
          slot={s}
          phase={phase}
          view={view}
          selected={selectedSlot === s.id}
          onClick={() => onSlotClick(s.id)}
          onPlus={() => setPlusSlot((v) => (v === s.id ? null : s.id))}
        />
      ))}
      {plusSlot && (
        <PlusPopover
          slot={plusSlot}
          phase={phase}
          onClose={() => setPlusSlot(null)}
          onManage={() => {
            setPlusSlot(null);
            onSlotClick(plusSlot);
          }}
        />
      )}
    </div>
  );
}

function SlotNode({
  slot, phase, view, selected, onClick, onPlus,
}: {
  slot: SlotDef; phase: Phase; view: View; selected: boolean; onClick: () => void; onPlus: () => void;
}) {
  const { team, data, updateTeam } = useStore();
  const { t, pos, posName } = useI18n();
  const { startDrag, overSlot } = useDnd();
  const lang = data.settings.lang;

  const starter = starterOf(team, phase, slot.id);
  const main = mainOf(team, phase, slot.id);
  const aux = auxOf(team, phase, slot.id);

  let assignment: Assignment | undefined;
  let faded = false;
  let kind: 'token' | 'empty' | 'nosub' | 'auxonly' = 'empty';
  if (view === 'starters') {
    assignment = starter;
    kind = starter ? 'token' : 'empty';
  } else if (starter) {
    assignment = main;
    kind = main ? 'token' : aux.length ? 'auxonly' : 'nosub';
  } else if (main || aux.length) {
    assignment = main;
    faded = true;
    kind = main ? 'token' : 'auxonly';
  }

  const player: Player | undefined = assignment ? team.players.find((p) => p.id === assignment!.playerId) : undefined;
  const fam = assignment ? familiarityAt(player, phase, slot.id) : null;
  const alsoStarter = view === 'subs' && !!assignment && isStarter(team, assignment.playerId, phase);
  const plusCount = view === 'subs' ? aux.length : 0;
  const abbr = assignment ? roleAbbr(assignment.role, lang) : '';

  const label = [
    pos(slot.pos),
    player ? player.name : kind === 'nosub' ? t('noSub') : '',
    assignment?.role ? roleName(assignment.role, lang) : '',
    alsoStarter ? t('alsoStarter') : '',
    plusCount ? `+${plusCount} ${t('aux')}` : '',
  ].filter(Boolean).join(', ');

  const hint = [posName(slot.pos), assignment?.role ? roleName(assignment.role, lang) : ''].filter(Boolean).join(' · ');

  const cls = [
    'slot',
    `slot--${kind}`,
    faded && 'slot--faded',
    selected && 'slot--selected',
    overSlot === slot.id && 'slot--over',
    alsoStarter && 'slot--also-starter',
  ].filter(Boolean).join(' ');

  return (
    <div className={cls} style={{ left: `${slot.x}%`, top: `${slot.y}%` }} data-drop-slot={slot.id} data-group={POS_GROUP[slot.pos]}>
      <button
        type="button"
        className="slot-btn"
        aria-label={label}
        title={hint}
        aria-pressed={selected}
        onClick={onClick}
        onPointerDown={
          player && assignment
            ? (e) => startDrag(e, { playerId: player.id, assignmentId: assignment!.id, label: shortName(player.name) })
            : undefined
        }
        style={player ? { touchAction: 'none' } : undefined}
      >
        {kind === 'empty' ? (
          <span className="slot-empty-dot" aria-hidden="true" />
        ) : (
          <>
            <span className="disc" data-fam={fam ?? 'none'} aria-hidden="true">
              {kind === 'token' ? abbr || pos(slot.pos) : kind === 'nosub' ? '—' : ''}
              {alsoStarter && <span className="disc-badge">XI</span>}
            </span>
            {player && <span className="token-name" aria-hidden="true">{shortName(player.name)}</span>}
            {kind === 'nosub' && <span className="token-name token-name--muted" aria-hidden="true">{t('noSub')}</span>}
          </>
        )}
      </button>
      {player && assignment && (
        <button
          type="button"
          className="remove-btn"
          onClick={() => updateTeam((tm) => removeAssignment(tm, assignment!.id))}
          aria-label={t('removeFromSlot', { name: player.name, pos: pos(slot.pos) })}
          title={t('removeFromSlot', { name: player.name, pos: pos(slot.pos) })}
        >
          <Icon name="x" size={12} />
        </button>
      )}
      {plusCount > 0 && (
        <button type="button" className="plus-btn" onClick={onPlus} aria-label={`${t('plusTitle')}: ${pos(slot.pos)}`}>
          <Icon name="plus" size={12} />
          {plusCount}
        </button>
      )}
    </div>
  );
}

function PlusPopover({ slot, phase, onClose, onManage }: { slot: SlotId; phase: Phase; onClose: () => void; onManage: () => void }) {
  const { team, data, updateTeam } = useStore();
  const { t, pos } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const def = SLOTS.find((s) => s.id === slot)!;
  const aux = auxOf(team, phase, slot);
  const list = [mainOf(team, phase, slot), ...aux].filter((a): a is Assignment => !!a);

  // The popover belongs to the +N pill: once the last auxiliary sub is gone, close it.
  useEffect(() => {
    if (!aux.length) closeRef.current();
  }, [aux.length]);

  const remove = (id: string) => {
    updateTeam((tm) => removeAssignment(tm, id));
    // The focused row button disappears; keep focus inside the popover.
    ref.current?.querySelector<HTMLElement>('.popover-head button')?.focus();
  };

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [slot]);

  const flipX = def.x > 60;
  const flipY = def.y > 60;
  return (
    <div
      ref={ref}
      className="popover"
      role="dialog"
      aria-label={t('plusTitle')}
      style={{
        left: flipX ? undefined : `${def.x}%`,
        right: flipX ? `${100 - def.x}%` : undefined,
        top: flipY ? undefined : `calc(${def.y}% + 30px)`,
        bottom: flipY ? `calc(${100 - def.y}% + 30px)` : undefined,
      }}
    >
      <div className="popover-head">
        <strong>{pos(def.pos)}</strong>
        <button type="button" className="icon-btn icon-btn--sm" onClick={onClose} aria-label={t('close')}>
          <Icon name="x" />
        </button>
      </div>
      <ul className="popover-list">
        {list.map((a) => {
          const p = team.players.find((x) => x.id === a.playerId);
          return (
            <li key={a.id}>
              <FamDot level={familiarityAt(p, phase, slot)} />
              <span className="grow truncate">{p?.name}</span>
              <span className="muted small">{roleAbbr(a.role, data.settings.lang)}</span>
              <span className={`tier-chip tier-chip--${a.tier}`}>{a.tier === 'main' ? t('mainSub') : t('aux')}</span>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                onClick={() => remove(a.id)}
                aria-label={t('removeFromSlot', { name: p?.name ?? '', pos: pos(def.pos) })}
                title={t('removeFromSlot', { name: p?.name ?? '', pos: pos(def.pos) })}
              >
                <Icon name="x" />
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn btn--ghost btn--block" onClick={onManage}>
        <Icon name="edit" /> {t('assigned')}…
      </button>
    </div>
  );
}

function PitchMarkings() {
  return (
    <svg className="pitch-lines" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="var(--pitch-line)" strokeWidth="0.35">
        <rect x="1" y="1" width="66" height="103" />
        <line x1="1" y1="52.5" x2="67" y2="52.5" />
        <circle cx="34" cy="52.5" r="9.15" />
        <rect x="13.84" y="1" width="40.32" height="16.5" />
        <rect x="24.84" y="1" width="18.32" height="5.5" />
        <rect x="13.84" y="87.5" width="40.32" height="16.5" />
        <rect x="24.84" y="98.5" width="18.32" height="5.5" />
        <path d="M26.7 17.5a9.15 9.15 0 0 0 14.6 0" />
        <path d="M26.7 87.5a9.15 9.15 0 0 1 14.6 0" />
      </g>
      <g fill="var(--pitch-line)">
        <circle cx="34" cy="52.5" r="0.5" />
        <circle cx="34" cy="12" r="0.4" />
        <circle cx="34" cy="93" r="0.4" />
      </g>
    </svg>
  );
}
