import { useRef, useState } from 'react';
import { emptyTeam } from '../domain/logic';
import type { AppData, Lang } from '../domain/types';
import { useI18n } from '../i18n/I18n';
import { exportData, parseData } from '../state/storage';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import { ConfirmDialog, Modal } from './Modal';

export function Header({ onToast }: { onToast: (msg: string, kind?: 'ok' | 'error') => void }) {
  const { data, setData, setSettings, undo, canUndo } = useStore();
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<AppData | null>(null);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const { lang, theme } = data.settings;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = parseData(JSON.parse(await file.text()));
      if (!parsed) throw new Error('invalid');
      setPendingImport(parsed);
    } catch {
      onToast(t('importError'), 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true"><Icon name="field" size={18} /></span>
        <span className="brand-name">{t('appName')}</span>
      </div>

      <div className="team-picker">
        <label htmlFor="team-select" className="sr-only">{t('team')}</label>
        <select
          id="team-select"
          className="input input--team"
          value={data.activeTeamId}
          onChange={(e) => setData({ ...data, activeTeamId: e.target.value })}
        >
          {data.teams.map((tm) => (
            <option key={tm.id} value={tm.id}>{tm.name}</option>
          ))}
        </select>
        <button type="button" className="icon-btn" onClick={() => setTeamsOpen(true)} title={t('manageTeams')} aria-label={t('manageTeams')}>
          <Icon name="settings" />
        </button>
      </div>

      <div className="header-actions">
        <button type="button" className="icon-btn" onClick={undo} disabled={!canUndo} title={`${t('undo')} (Ctrl+Z)`} aria-label={t('undo')}>
          <Icon name="undo" />
        </button>
        <button type="button" className="icon-btn hide-narrow" onClick={() => exportData(data)} title={t('exportHint')} aria-label={t('exportData')}>
          <Icon name="download" />
        </button>
        <button type="button" className="icon-btn hide-narrow" onClick={() => fileRef.current?.click()} title={t('importHint')} aria-label={t('importData')}>
          <Icon name="upload" />
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button
          type="button"
          className="icon-btn"
          onClick={() => setSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}
          title={theme === 'dark' ? t('themeLight') : t('themeDark')}
          aria-label={theme === 'dark' ? t('themeLight') : t('themeDark')}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <div className="segmented segmented--sm" role="radiogroup" aria-label={t('language')}>
          {(['es', 'en'] as Lang[]).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={lang === l} className="seg" onClick={() => setSettings({ lang: l })}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {pendingImport && (
        <ConfirmDialog
          message={t('importConfirm')}
          confirmLabel={t('importData')}
          onCancel={() => setPendingImport(null)}
          onConfirm={() => {
            setData({ ...pendingImport, settings: data.settings });
            setPendingImport(null);
            onToast(t('importOk'));
          }}
        />
      )}
      {teamsOpen && (
        <TeamsModal
          onClose={() => setTeamsOpen(false)}
          onToast={onToast}
          onImport={() => {
            setTeamsOpen(false);
            fileRef.current?.click();
          }}
        />
      )}
    </header>
  );
}

function TeamsModal({
  onClose, onToast, onImport,
}: { onClose: () => void; onToast: (m: string, k?: 'ok' | 'error') => void; onImport: () => void }) {
  const { data, setData } = useStore();
  const { t } = useI18n();
  const [toDelete, setToDelete] = useState<string | null>(null);

  const rename = (id: string, name: string) => {
    const clean = name.trim().slice(0, 60);
    const current = data.teams.find((tm) => tm.id === id);
    if (!clean || !current || current.name === clean) return;
    setData({ ...data, teams: data.teams.map((tm) => (tm.id === id ? { ...tm, name: clean } : tm)) });
  };

  if (toDelete) {
    const team = data.teams.find((x) => x.id === toDelete)!;
    return (
      <ConfirmDialog
        message={t('deleteTeamConfirm', { name: team.name })}
        confirmLabel={t('confirmDelete')}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const teams = data.teams.filter((x) => x.id !== toDelete);
          setData({ ...data, teams, activeTeamId: data.activeTeamId === toDelete ? teams[0].id : data.activeTeamId });
          setToDelete(null);
        }}
      />
    );
  }

  return (
    <Modal
      title={t('teamsAndData')}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button
            type="button"
            className="btn btn--ghost push-left"
            onClick={() => {
              const team = emptyTeam(`${t('newTeamName')} ${data.teams.length + 1}`);
              setData({ ...data, teams: [...data.teams, team], activeTeamId: team.id });
            }}
          >
            <Icon name="plus" /> {t('newTeam')}
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>{t('close')}</button>
        </>
      }
    >
      <ul className="team-list">
        {data.teams.map((tm) => (
          <li key={tm.id} className={`team-row${tm.id === data.activeTeamId ? ' team-row--active' : ''}`}>
            <input
              className="input grow"
              defaultValue={tm.name}
              aria-label={t('rename')}
              maxLength={60}
              onBlur={(e) => rename(tm.id, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <span className="count">{tm.players.length}</span>
            <button
              type="button"
              className="icon-btn"
              aria-label={`${t('delete')}: ${tm.name}`}
              onClick={() => (data.teams.length > 1 ? setToDelete(tm.id) : onToast(t('lastTeam'), 'error'))}
            >
              <Icon name="trash" />
            </button>
          </li>
        ))}
      </ul>
      <section className="field">
        <span className="label">{t('data')}</span>
        <div className="data-actions">
          <button type="button" className="btn" onClick={() => exportData(data)}>
            <Icon name="download" /> {t('exportData')}
          </button>
          <button type="button" className="btn" onClick={onImport}>
            <Icon name="upload" /> {t('importData')}
          </button>
        </div>
        <p className="muted small">{t('exportHint')}. {t('importHint')}.</p>
      </section>
    </Modal>
  );
}
