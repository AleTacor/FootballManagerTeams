import { useEffect, useRef, useState } from 'react';
import { auxOf, familiarityAt, mainOf, removeAssignment, starterOf } from '../domain/logic';
import { POS_GROUP, SLOT_BY_ID, SLOTS, type SlotDef } from '../domain/positions';
import { roleAbbr, roleName } from '../domain/roles';
import type { Assignment, Phase, Player, SlotId, View } from '../domain/types';
import { useI18n } from '../i18n/I18n';
import { useStore } from '../state/store';
import { useDnd } from './dnd';
import { FamDot } from './FamDot';
import { Icon } from './Icon';
import { linkColors, linkStyle } from './links';
import { shortName } from './names';
import { useLatest } from './useLatest';

interface Props {
  phase: Phase;
  view: View;
  selectedSlot: SlotId | null;
  targeting: boolean;
  onSlotClick: (slot: SlotId) => void;
}

export function Pitch({ phase, view, selectedSlot, targeting, onSlotClick }: Props) {
  const { t } = useI18n();
  const { dragging } = useDnd();
  const [plusSlot, setPlusSlot] = useState<SlotId | null>(null);
  // Close the +N popover when the phase or view changes (adjusted during render, no effect).
  const [shownFor, setShownFor] = useState(`${phase}:${view}`);
  if (shownFor !== `${phase}:${view}`) {
    setShownFor(`${phase}:${view}`);
    setPlusSlot(null);
  }

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

  const colors = linkColors(team);
  // The starter of this slot has a main sub playing in another slot.
  const coveredElsewhere = !!starter && !main && team.assignments.some(
    (a) => a.phase === phase && a.tier === 'main' && a.replaces === starter.playerId,
  );

  let assignment: Assignment | undefined;
  let faded = false;
  let kind: 'token' | 'empty' | 'nosub' | 'auxonly' = 'empty';
  if (view === 'starters') {
    assignment = starter;
    kind = starter ? 'token' : 'empty';
  } else if (starter && coveredElsewhere && !aux.length) {
    kind = 'empty';
  } else if (starter) {
    assignment = main;
    kind = main ? 'token' : aux.length ? 'auxonly' : 'nosub';
  } else if (main || aux.length) {
    assignment = main;
    // A main sub playing another position than the starter he replaces is shown at full strength.
    const replacedSlot = main && starterSlotOf(team.assignments, phase, main.replaces);
    faded = !(replacedSlot && SLOT_BY_ID[replacedSlot].pos !== slot.pos);
    kind = main ? 'token' : 'auxonly';
  }

  const player: Player | undefined = assignment ? team.players.find((p) => p.id === assignment!.playerId) : undefined;
  const fam = assignment ? familiarityAt(player, phase, slot.id) : null;
  const plusCount = view === 'subs' ? aux.length : 0;
  const abbr = assignment ? roleAbbr(assignment.role, lang) : '';
  // In the subs view, the starter the shown sub replaces (his colour and surname under the token).
  const replaced = view === 'subs' && assignment?.replaces ? team.players.find((p) => p.id === assignment!.replaces) : undefined;
  const linkColor = replaced ? colors.get(replaced.id) : coveredElsewhere && kind === 'empty' ? colors.get(starter!.playerId) : undefined;

  const label = [
    pos(slot.pos),
    player ? player.name : kind === 'nosub' ? t('noSub') : '',
    assignment?.role ? roleName(assignment.role, lang) : '',
    replaced ? t('replacesName', { name: replaced.name }) : '',
    plusCount ? `+${plusCount} ${t('aux')}` : '',
  ].filter(Boolean).join(', ');

  const hint = [posName(slot.pos), assignment?.role ? roleName(assignment.role, lang) : ''].filter(Boolean).join(' · ');

  const cls = [
    'slot',
    `slot--${kind}`,
    faded && 'slot--faded',
    selected && 'slot--selected',
    overSlot === slot.id && 'slot--over',
    linkColor && 'slot--linked',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      style={{ left: `${slot.x}%`, top: `${slot.y}%`, ...linkStyle(linkColor) }}
      data-drop-slot={slot.id}
      data-group={POS_GROUP[slot.pos]}
    >
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
            </span>
            {player && <span className="token-name" aria-hidden="true">{shortName(player.name)}</span>}
            {replaced && (
              <span className="token-link" aria-hidden="true">
                <span className="link-swatch" />
                {shortName(replaced.name)}
              </span>
            )}
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
  const closeRef = useLatest(onClose);
  const def = SLOTS.find((s) => s.id === slot)!;
  const aux = auxOf(team, phase, slot);
  const list = [mainOf(team, phase, slot), ...aux].filter((a): a is Assignment => !!a);
  const colors = linkColors(team);

  // The popover belongs to the +N pill: once the last auxiliary sub is gone, close it.
  useEffect(() => {
    if (!aux.length) closeRef.current();
  }, [aux.length, closeRef]);

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
  }, [slot, closeRef]);

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
          const replaced = a.replaces ? team.players.find((x) => x.id === a.replaces) : undefined;
          return (
            <li key={a.id}>
              <FamDot level={familiarityAt(p, phase, slot)} />
              <span className="grow min0">
                <span className="truncate block">{p?.name}</span>
                {replaced && (
                  <span className="link-line" style={linkStyle(colors.get(replaced.id))} title={t('replacesName', { name: replaced.name })}>
                    <span className="link-swatch" aria-hidden="true" />
                    <span className="truncate">{t('replacesName', { name: shortName(replaced.name) })}</span>
                  </span>
                )}
              </span>
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
    // 68 × 112: a bit longer than a real pitch, so stacked labels (name, replaced starter) fit between rows.
    <svg className="pitch-lines" viewBox="0 0 68 112" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="var(--pitch-line)" strokeWidth="0.35">
        <rect x="1" y="1" width="66" height="110" />
        <line x1="1" y1="56" x2="67" y2="56" />
        <circle cx="34" cy="56" r="9.15" />
        <rect x="13.84" y="1" width="40.32" height="16.5" />
        <rect x="24.84" y="1" width="18.32" height="5.5" />
        <rect x="13.84" y="94.5" width="40.32" height="16.5" />
        <rect x="24.84" y="105.5" width="18.32" height="5.5" />
        <path d="M26.7 17.5a9.15 9.15 0 0 0 14.6 0" />
        <path d="M26.7 94.5a9.15 9.15 0 0 1 14.6 0" />
      </g>
      <g fill="var(--pitch-line)">
        <circle cx="34" cy="56" r="0.5" />
        <circle cx="34" cy="12" r="0.4" />
        <circle cx="34" cy="100" r="0.4" />
      </g>
    </svg>
  );
}

function starterSlotOf(assignments: Assignment[], phase: Phase, playerId: string | null): SlotId | undefined {
  return assignments.find((a) => a.phase === phase && a.tier === 'starter' && a.playerId === playerId)?.slot;
}
