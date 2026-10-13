import type { Familiarity } from '../domain/types';
import { useI18n } from '../i18n/I18n';

export function FamDot({ level, withLabel = false }: { level: Familiarity | null; withLabel?: boolean }) {
  const { fam, t } = useI18n();
  const label = level ? fam(level) : t('doesntPlayHere');
  return (
    <span className="fam" title={label}>
      <span className="fam-dot" data-fam={level ?? 'none'} aria-hidden="true" />
      {withLabel ? <span className="fam-label">{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  );
}
