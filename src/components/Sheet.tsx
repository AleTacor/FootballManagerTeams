import { useEffect, useRef, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18n';
import { Icon } from './Icon';

/**
 * Side panel on desktop, bottom sheet on phones. Non-modal: the pitch stays usable
 * behind it so players can still be dragged while it is open. A click outside closes it,
 * except on pitch slots (they switch the panel to another slot), popovers and dialogs.
 * The click that ends a drag is swallowed by dnd.tsx, so dropping doesn't close it.
 */
export function Sheet({
  title, subtitle, onClose, children,
}: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.modal')) closeRef.current();
    };
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (!el?.isConnected || ref.current?.contains(el)) return;
      if (el.closest('[data-drop-slot], .popover, .modal-backdrop')) return;
      closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, []);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.sheet-close')?.focus({ preventScroll: true });
  }, [title, subtitle]);

  return (
    <aside ref={ref} className="sheet" aria-label={title}>
      <header className="sheet-head">
        <div className="min0">
          <h2 className="sheet-title">{title}</h2>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        <button type="button" className="icon-btn sheet-close" onClick={onClose} aria-label={t('close')}>
          <Icon name="x" size={18} />
        </button>
      </header>
      <div className="sheet-body">{children}</div>
    </aside>
  );
}
