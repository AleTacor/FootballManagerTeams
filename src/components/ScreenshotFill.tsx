import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { StringKey } from '../i18n/strings';
import { useI18n } from '../i18n/I18n';
import type { ScreenshotResult } from '../screenshot/read';
import { Icon } from './Icon';
import { useLatest } from './useLatest';

type Status = { kind: 'idle' } | { kind: 'reading' } | { kind: 'done' | 'error'; msgs: StringKey[] };

/** First image in a paste or drop, if any. */
function imageFrom(data: DataTransfer | null): File | null {
  for (const f of Array.from(data?.files ?? [])) if (f.type.startsWith('image/')) return f;
  return null;
}

/**
 * "Fill from screenshot" strip for the player editor: paste (Ctrl+V anywhere in the dialog
 * or the Paste button), choose a file, or drop an image. The result fills the editor, which
 * is the review step: nothing is saved until the user presses Save.
 */
export function ScreenshotFill({ initial, onResult }: { initial?: Blob; onResult: (r: ScreenshotResult) => void }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useLatest(onResult);
  const runId = useRef(0);

  const read = async (blob: Blob | null) => {
    if (!blob || !blob.type.startsWith('image/')) {
      setStatus({ kind: 'error', msgs: ['shotNotImage'] });
      return;
    }
    const id = ++runId.current;
    setStatus({ kind: 'reading' });
    try {
      const { readScreenshot } = await import('../screenshot/read');
      const r = await readScreenshot(blob);
      if (id !== runId.current) return; // a newer image replaced this one
      const hasPositions = !!r.positions && Object.keys(r.positions).length > 0;
      if (!r.name && !hasPositions) {
        setStatus({ kind: 'error', msgs: ['shotNothing'] });
        return;
      }
      resultRef.current(r);
      const msgs: StringKey[] = ['shotDone'];
      if (!r.name) msgs.push('shotNoName');
      if (!hasPositions) msgs.push('shotNoPitch');
      setStatus({ kind: 'done', msgs });
    } catch (e) {
      console.error(e);
      if (id === runId.current) setStatus({ kind: 'error', msgs: ['shotFailed'] });
    }
  };
  const readRef = useLatest(read);

  // Ctrl/Cmd+V with an image anywhere in the dialog; text pastes into inputs are left alone.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const img = imageFrom(e.clipboardData);
      if (!img) return;
      e.preventDefault();
      readRef.current(img);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [readRef]);

  // An image pasted on the main screen opens the editor with it. Runs once, even in StrictMode.
  const startedRef = useRef(false);
  useEffect(() => {
    if (initial && !startedRef.current) {
      startedRef.current = true;
      readRef.current(initial);
    }
  }, [initial, readRef]);

  const pasteFromClipboard = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((ty) => ty.startsWith('image/'));
        if (type) return read(await item.getType(type));
      }
      setStatus({ kind: 'error', msgs: ['shotClipboardEmpty'] });
    } catch {
      setStatus({ kind: 'error', msgs: ['shotClipboardEmpty'] });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const img = imageFrom(e.dataTransfer);
    if (img) read(img);
    else setStatus({ kind: 'error', msgs: ['shotNotImage'] });
  };

  const canReadClipboard = typeof navigator !== 'undefined' && !!navigator.clipboard?.read;

  return (
    <div
      className={`shot-drop${over ? ' shot-drop--over' : ''}`}
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={onDrop}
    >
      <div className="shot-drop-main">
        <Icon name="image" size={20} />
        <div className="min0">
          <p className="shot-title">{t('shotTitle')}</p>
          <p className="muted small">{t('shotHint')}</p>
        </div>
        <div className="shot-actions">
          <button type="button" className="btn btn--sm" onClick={() => fileRef.current?.click()} disabled={status.kind === 'reading'}>
            {t('shotChoose')}
          </button>
          {canReadClipboard && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={pasteFromClipboard} disabled={status.kind === 'reading'}>
              {t('shotPaste')}
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            read(e.target.files?.[0] ?? null);
            e.target.value = ''; // picking the same file again should re-read it
          }}
        />
      </div>
      <div className="shot-status" role="status" aria-live="polite">
        {status.kind === 'reading' && <p className="muted small">{t('shotReading')}</p>}
        {(status.kind === 'done' || status.kind === 'error') &&
          status.msgs.map((m, i) => (
            <p key={m} className={`small ${status.kind === 'error' ? 'shot-error' : i > 0 ? 'shot-warn' : 'shot-ok'}`}>
              {status.kind === 'done' && i === 0 && <Icon name="check" size={14} />} {t(m)}
            </p>
          ))}
      </div>
    </div>
  );
}
