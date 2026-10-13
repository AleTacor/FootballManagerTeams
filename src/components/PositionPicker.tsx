import { FAMILIARITY_LEVELS, POS_CODES, POS_GRID, POS_GROUP } from '../domain/positions';
import type { Familiarity, PosCode, PositionMap } from '../domain/types';
import { useI18n } from '../i18n/I18n';
import { FamDot } from './FamDot';
import { Icon } from './Icon';

/** Mini pitch to pick positions, plus a familiarity picker (FM dots) for each picked one. */
export function PositionPicker({ value, onChange, idPrefix }: { value: PositionMap; onChange: (v: PositionMap) => void; idPrefix: string }) {
  const { t, pos, posName, fam } = useI18n();

  const toggle = (code: PosCode) => {
    const next = { ...value };
    if (next[code]) delete next[code];
    else next[code] = 'natural';
    onChange(next);
  };
  const setLevel = (code: PosCode, level: Familiarity) => onChange({ ...value, [code]: level });

  const selected = POS_CODES.filter((c) => value[c]);

  return (
    <div className="pos-picker">
      <div className="mini-pitch" role="group" aria-label={t('positions')}>
        {POS_GRID.flatMap((row, r) =>
          row.map((code, c) =>
            code ? (
              <button
                key={code}
                type="button"
                className={`mini-cell${value[code] ? ' mini-cell--on' : ''}`}
                data-group={POS_GROUP[code]}
                data-fam={value[code] ?? 'none'}
                style={{ gridRow: r + 1, gridColumn: c === 2 ? '2 / 5' : c + 1 }}
                aria-pressed={!!value[code]}
                title={posName(code)}
                onClick={() => toggle(code)}
              >
                {pos(code)}
              </button>
            ) : null,
          ),
        )}
      </div>

      <div className="fam-editor">
        {selected.length === 0 ? (
          <p className="muted small">{t('positionsHint')}</p>
        ) : (
          <ul className="fam-list">
            {selected.map((code) => (
              <li key={code} className="fam-row">
                <span className="pos-badge" data-group={POS_GROUP[code]} title={posName(code)}>{pos(code)}</span>
                <div className="fam-options" role="radiogroup" aria-label={`${t('familiarity')} ${pos(code)}`}>
                  {FAMILIARITY_LEVELS.map((level) => (
                    <label key={level} className="fam-option" title={fam(level)}>
                      <input
                        type="radio"
                        name={`${idPrefix}-${code}`}
                        checked={value[code] === level}
                        onChange={() => setLevel(code, level)}
                      />
                      <span className="fam-swatch" data-fam={level} aria-hidden="true" />
                      <span className="sr-only">{fam(level)}</span>
                    </label>
                  ))}
                </div>
                <span className="fam-current muted small">
                  <FamDot level={value[code]!} withLabel />
                </span>
                <button type="button" className="icon-btn icon-btn--sm" onClick={() => toggle(code)} aria-label={`${t('remove')} ${pos(code)}`}>
                  <Icon name="x" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
