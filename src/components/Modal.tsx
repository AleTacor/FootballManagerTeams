import { useEffect, useRef, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18n';
import { Icon } from './Icon';
import { useLatest } from './useLatest';

export function Modal({
  title, onClose, children, footer, size = 'md',
}: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useLatest(onClose);

  // Runs once per open: focus handling must not re-run on every parent render.
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const el = ref.current;
    // React's autoFocus has already focused a field by now; only pick one if it hasn't.
    if (!el?.contains(document.activeElement)) {
      el?.querySelector<HTMLElement>('[autofocus], input, select, button:not(.modal-x)')?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab' && el) {
        const items = Array.from(
          el.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        ).filter((x) => !x.hasAttribute('disabled'));
        if (!items.length) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prevFocus?.focus?.();
    };
  }, [closeRef]);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal modal--${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="icon-btn modal-x" onClick={onClose} aria-label={t('close')}>
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  message, confirmLabel, onConfirm, onCancel,
}: { message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  return (
    <Modal
      title={confirmLabel}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>{t('cancel')}</button>
          <button type="button" className="btn btn--danger-solid" onClick={onConfirm}>{confirmLabel}</button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}
