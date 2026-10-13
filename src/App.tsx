import { useCallback, useEffect, useState } from 'react';
import { DndProvider, useDnd, type DragPayload } from './components/dnd';
import { Header } from './components/Header';
import { Icon } from './components/Icon';
import { Pitch, shortName } from './components/Pitch';
import { PlayerEditor } from './components/PlayerEditor';
import { SlotPanel } from './components/SlotPanel';
import { SquadList } from './components/SquadList';
import { sampleTeam } from './data/sample';
import {
  assignPlayer, isStarter, MAX_STARTERS, moveAssignment, startersCount, unplacedStarters, type LogicError,
} from './domain/logic';
import type { Phase, SlotId, Tier, View } from './domain/types';
import { I18nProvider, useI18n } from './i18n/I18n';
import { StoreProvider, useStore } from './state/store';

export default function App() {
  return (
    <StoreProvider>
      <Localized />
    </StoreProvider>
  );
}

function Localized() {
  const { data } = useStore();
  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.theme;
    document.documentElement.lang = data.settings.lang;
  }, [data.settings.theme, data.settings.lang]);
  return (
    <I18nProvider lang={data.settings.lang}>
      <Main />
    </I18nProvider>
  );
}

type Toast = { id: number; msg: string; kind: 'ok' | 'error' };
type Editor = { playerId: string | null; image?: Blob } | null;

function Main() {
  const { team, updateTeam, undo } = useStore();
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('ip');
  const [view, setView] = useState<View>('starters');
  const [panelSlot, setPanelSlot] = useState<SlotId | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [mobileTab, setMobileTab] = useState<'pitch' | 'squad'>('pitch');
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    setToast({ id: Date.now(), msg, kind });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const onError = useCallback((e: LogicError) => showToast(t(e), 'error'), [showToast, t]);

  const tierForView: Tier = view === 'starters' ? 'starter' : 'main';

  const placePlayer = useCallback(
    (playerId: string, slot: SlotId, assignmentId?: string, openPanel = true) => {
      let error: LogicError | undefined;
      updateTeam((tm) => {
        const a = assignmentId ? tm.assignments.find((x) => x.id === assignmentId) : undefined;
        const sameLayer = a && a.phase === phase && (view === 'starters' ? a.tier === 'starter' : a.tier !== 'starter');
        const r = sameLayer ? moveAssignment(tm, a!.id, slot) : assignPlayer(tm, playerId, phase, slot, tierForView);
        error = r.error;
        return r.team;
      });
      if (error) onError(error);
      else if (openPanel) setPanelSlot(slot); // open the panel so the role can be picked right away
    },
    [updateTeam, phase, view, tierForView, onError],
  );

  const onDrop = useCallback((p: DragPayload, slot: SlotId) => placePlayer(p.playerId, slot, p.assignmentId, false), [placePlayer]);

  const onSlotClick = (slot: SlotId) => {
    if (placing) {
      placePlayer(placing, slot);
      setPlacing(null);
      return;
    }
    setPanelSlot((s) => (s === slot ? null : slot));
  };

  // Global keys: Ctrl/Cmd+Z = undo, Esc = cancel placing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.closest('input, select, textarea');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing && !document.querySelector('.modal')) {
        e.preventDefault();
        undo();
      }
      if (e.key === 'Escape' && placing) setPlacing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, placing]);

  // Pasting an image on the main screen opens "Add player" and reads it as an FM26 screenshot.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (document.querySelector('.modal')) return; // the open dialog handles its own pastes
      const image = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (!image) return;
      e.preventDefault();
      setEditor({ playerId: null, image });
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // Close panel if its context disappears (team switch).
  useEffect(() => setPanelSlot(null), [team.id]);

  const placingPlayer = placing ? team.players.find((p) => p.id === placing) : undefined;
  const count = startersCount(team, phase);
  const ipSet = new Set(team.assignments.filter((a) => a.phase === 'ip' && a.tier === 'starter').map((a) => a.playerId));
  const oopSet = new Set(team.assignments.filter((a) => a.phase === 'oop' && a.tier === 'starter').map((a) => a.playerId));
  const phasesDiffer = ipSet.size !== oopSet.size || [...ipSet].some((id) => !oopSet.has(id));

  return (
    <DndProvider onDrop={onDrop}>
      <div className={`app${panelSlot ? ' app--panel' : ''}`}>
        <Header onToast={showToast} />
        <main className="layout" data-mobile-tab={mobileTab}>
          <section className="pitch-col" aria-label={t('pitch')}>
            <div className="pitch-controls">
              <div className="segmented" role="radiogroup" aria-label={t('phase')}>
                {(['ip', 'oop'] as Phase[]).map((ph) => (
                  <button key={ph} type="button" role="radio" aria-checked={phase === ph} className="seg" onClick={() => setPhase(ph)}>
                    {t(ph === 'ip' ? 'inPossession' : 'outOfPossession')}
                  </button>
                ))}
              </div>
              <div className="segmented" role="radiogroup" aria-label={t('view')}>
                {(['starters', 'subs'] as View[]).map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={view === v} className="seg" onClick={() => setView(v)}>
                    {t(v)}
                  </button>
                ))}
              </div>
              <span className={`stat-chip${count > MAX_STARTERS ? ' stat-chip--warn' : ''}`} title={t('startersCount')}>
                {t('startersCount')} <strong className="num">{count}/{MAX_STARTERS}</strong>
              </span>
              {phasesDiffer && count > 0 && <span className="stat-chip stat-chip--warn">{t('phasesDiffer')}</span>}
            </div>

            {team.players.length === 0 && (
              <div className="pitch-empty">
                <span className="grow muted">{t('emptySquadText')}</span>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditor({ playerId: null })}>
                  <Icon name="userPlus" /> {t('addPlayer')}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => updateTeam((tm) => ({ ...sampleTeam(tm.name), id: tm.id }))}
                >
                  {t('loadExample')}
                </button>
              </div>
            )}

            {placingPlayer && (
              <div className="banner" role="status">
                <Icon name="crosshair" />
                <span className="grow">{t('placing', { name: placingPlayer.name })}</span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPlacing(null)}>{t('cancel')}</button>
              </div>
            )}

            <div className="pitch-wrap">
              <Pitch phase={phase} view={view} selectedSlot={panelSlot} targeting={!!placing} onSlotClick={onSlotClick} />
            </div>

            {view === 'starters' && <UnplacedTray phase={phase} onPick={(id) => setPlacing(id)} />}
            <p className="hint muted small">{t('dragHint')}</p>
          </section>

          <section className="squad-col" aria-label={t('squad')}>
            <SquadList
              phase={phase}
              onAdd={() => setEditor({ playerId: null })}
              onEdit={(id) => setEditor({ playerId: id })}
              onPlace={(id) => {
                setPlacing(id);
                setMobileTab('pitch');
              }}
              onLoadExample={() => updateTeam((tm) => ({ ...sampleTeam(tm.name), id: tm.id }))}
            />
          </section>

          {panelSlot && (
            <SlotPanel phase={phase} view={view} slot={panelSlot} onClose={() => setPanelSlot(null)} onError={onError} />
          )}
        </main>

        <nav className="tabbar" aria-label="Main">
          <button type="button" className="tab" aria-current={mobileTab === 'pitch' ? 'page' : undefined} onClick={() => setMobileTab('pitch')}>
            <Icon name="field" size={20} /> {t('pitch')}
          </button>
          <button type="button" className="tab" aria-current={mobileTab === 'squad' ? 'page' : undefined} onClick={() => setMobileTab('squad')}>
            <Icon name="users" size={20} /> {t('squad')} <span className="count">{team.players.length}</span>
          </button>
        </nav>

        <div className="toast-area" aria-live="polite">
          {toast && <div key={toast.id} className={`toast toast--${toast.kind}`}>{toast.msg}</div>}
        </div>

        {editor && <PlayerEditor key={editor.playerId ?? 'new'} playerId={editor.playerId} image={editor.image} onClose={() => setEditor(null)} onError={onError} />}
      </div>
    </DndProvider>
  );
}

function UnplacedTray({ phase, onPick }: { phase: Phase; onPick: (id: string) => void }) {
  const { team } = useStore();
  const { t } = useI18n();
  const { startDrag } = useDnd();
  const ids = unplacedStarters(team, phase).filter((id) => !isStarter(team, id, phase));
  if (!ids.length) return null;
  return (
    <div className="tray">
      <span className="tray-title small muted">{t('unplaced')}</span>
      <div className="tray-items">
        {ids.map((id) => {
          const p = team.players.find((x) => x.id === id);
          if (!p) return null;
          return (
            <button
              key={id}
              type="button"
              className="chip"
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => startDrag(e, { playerId: id, label: shortName(p.name) })}
              onClick={() => onPick(id)}
            >
              <Icon name="crosshair" size={14} /> {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
