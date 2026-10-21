import { useEffect, useState } from 'react';
import { FAMILIARITY_RANK, POS_CODES, POS_GROUP } from '../domain/positions';
import type { PositionMap } from '../domain/types';
import { useI18n } from '../i18n/I18n';
import { Icon } from './Icon';

/** Small pieces shared by the squad and target lists. */

/** Copies the player's name to the clipboard; the icon shows a check (or the error) for a moment. */
export function CopyNameButton({ name }: { name: string }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (status === 'idle') return;
    const id = setTimeout(() => setStatus('idle'), 1500);
    return () => clearTimeout(id);
  }, [status]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(name);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  };

  const text = status === 'copied' ? t('nameCopied') : status === 'failed' ? t('copyFailed') : t('copyName');
  return (
    <button
      type="button"
      className={`icon-btn${status === 'copied' ? ' icon-btn--done' : status === 'failed' ? ' icon-btn--failed' : ''}`}
      title={text}
      aria-label={`${text}: ${name}`}
      onClick={() => void copy()}
    >
      <Icon name={status === 'copied' ? 'check' : status === 'failed' ? 'x' : 'copy'} />
    </button>
  );
}

export function PosBadges({ map }: { map: PositionMap }) {
  const { pos, posName, fam } = useI18n();
  const codes = POS_CODES.filter((c) => map[c]).sort((a, b) => FAMILIARITY_RANK[map[a]!] - FAMILIARITY_RANK[map[b]!]);
  if (!codes.length) return <span className="muted">—</span>;
  return (
    <span className="badges">
      {codes.map((c) => (
        <span key={c} className="pos-badge" data-group={POS_GROUP[c]} title={`${posName(c)} · ${fam(map[c]!)}`}>
          <span className="fam-dot" data-fam={map[c]} aria-hidden="true" />
          {pos(c)}
          <span className="sr-only">, {fam(map[c]!)}</span>
        </span>
      ))}
    </span>
  );
}
