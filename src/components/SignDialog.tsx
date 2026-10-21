import { signTarget, type LogicError, type Result } from '../domain/logic';
import { SLOT_BY_ID } from '../domain/positions';
import type { Phase, SignAs, Team } from '../domain/types';
import { useI18n } from '../i18n/I18n';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface Props {
  playerId: string;
  phase: Phase;
  onClose: () => void;
  onSigned: (name: string) => void;
  onError: (e: LogicError) => void;
}

const TIER_RANK = { starter: 0, main: 1, aux: 2 } as const;
const PHASES: Phase[] = ['ip', 'oop'];

/**
 * Asks how a transfer target joins: as starter or as substitute in his planned slots. Each
 * option previews who moves where in each phase, read from signTarget's result.
 */
export function SignDialog({ playerId, phase, onClose, onSigned, onError }: Props) {
  const { team, updateTeam } = useStore();
  const { t, pos } = useI18n();
  const player = team.players.find((p) => p.id === playerId);
  if (!player?.target) return null;
  const { slots } = player.target;
  const phaseLabel = (ph: Phase) => t(ph === 'ip' ? 'inPossession' : 'outOfPossession');
  // "D (R)" when both phases share the slot's position, else "D (R) · In possession, DM · Out of possession".
  const planned = PHASES.filter((ph) => slots[ph]);
  const posText = new Set(planned.map((ph) => SLOT_BY_ID[slots[ph]!].pos)).size === 1
    ? pos(SLOT_BY_ID[slots[planned[0]]!].pos)
    : planned.map((ph) => `${pos(SLOT_BY_ID[slots[ph]!].pos)} · ${phaseLabel(ph)}`).join(', ');

  const sign = (as: SignAs) => {
    let error: LogicError | undefined;
    updateTeam((tm) => {
      const r = signTarget(tm, playerId, as, phase);
      error = r.error;
      return r.team;
    });
    if (error) onError(error);
    else onSigned(player.name);
    onClose();
  };

  const title = t('signTitle', { name: player.name });
  if (!planned.length) {
    return (
      <Modal
        title={title}
        onClose={onClose}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button>
            <button type="button" className="btn btn--primary" onClick={() => sign('starter')}>
              <Icon name="userCheck" /> {t('sign')}
            </button>
          </>
        }
      >
        <p>{t('signNoPlan', { name: player.name })}</p>
      </Modal>
    );
  }

  const options: { as: SignAs; label: string; result: Result }[] = [
    { as: 'starter', label: t('signAsStarter'), result: signTarget(team, playerId, 'starter', phase) },
    { as: 'sub', label: t('signAsSub'), result: signTarget(team, playerId, 'sub', phase) },
  ];

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={<button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button>}
    >
      <p>{t('signQuestion', { pos: posText })}</p>
      <div className="sign-options">
        {options.map((o) => (
          <section key={o.as} className="sign-option">
            <h3>{o.label}</h3>
            {o.result.error ? (
              <p className="error-text">{t(o.result.error)}</p>
            ) : (
              PHASES.map((ph) => (
                <div key={ph} className="sign-phase">
                  <span className="phase-chip" title={phaseLabel(ph)}>{t(ph === 'ip' ? 'ipShort' : 'oopShort')}</span>
                  <ul>
                    {changes(team, o.result.team, ph, playerId).map((c) => (
                      <li key={c.id}>{t(c.key, { name: c.name, pos: pos(SLOT_BY_ID[c.slot].pos) })}</li>
                    ))}
                  </ul>
                </div>
              ))
            )}
            <button
              type="button"
              className={`btn ${o.as === 'starter' ? 'btn--primary' : ''}`}
              disabled={!!o.result.error}
              onClick={() => sign(o.as)}
            >
              {o.label}
            </button>
          </section>
        ))}
      </div>
    </Modal>
  );
}

/** Players whose best place in `phase` changed: the signed player first, then by new tier. */
function changes(before: Team, after: Team, phase: Phase, signedId: string) {
  const best = (tm: Team, id: string) =>
    tm.assignments
      .filter((a) => a.playerId === id && a.phase === phase)
      .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier])[0];
  const key = { starter: 'signStarts', main: 'signMain', aux: 'signAux' } as const;
  return after.players
    .map((p) => ({ p, was: best(before, p.id), now: best(after, p.id) }))
    .filter(({ was, now }) => now && (now.tier !== was?.tier || now.slot !== was?.slot))
    .sort((x, y) => Number(y.p.id === signedId) - Number(x.p.id === signedId) || TIER_RANK[x.now!.tier] - TIER_RANK[y.now!.tier])
    .map(({ p, now }) => ({ id: p.id, name: p.name, slot: now!.slot, key: key[now!.tier] }));
}
