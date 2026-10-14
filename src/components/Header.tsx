import { useRef, useState } from 'react';
import { copyTeam, emptyTeam } from '../domain/logic';
import type { AppData, Lang } from '../domain/types';
import { useI18n } from '../i18n/I18n';
import { exportData, parseData } from '../state/storage';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import { ConfirmDialog, Modal } from './Modal';

export function Header({ onToast }: { onToast: (msg: string, kind?: 'ok' | 'error') => void }) {
  const { data, setData, setSettings, undo, canUndo, redo, canRedo } = useStore();
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<AppData | null>(null);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const { lang } = data.settings;

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
        <button type="button" className="icon-btn" onClick={redo} disabled={!canRedo} title={`${t('redo')} (Ctrl+Y)`} aria-label={t('redo')}>
          <Icon name="redo" />
        </button>
        <button type="button" className="icon-btn hide-narrow" onClick={() => exportData(data)} title={t('exportHint')} aria-label={t('exportData')}>
          <Icon name="download" />
        </button>
        <button type="button" className="icon-btn hide-narrow" onClick={() => fileRef.current?.click()} title={t('importHint')} aria-label={t('importData')}>
          <Icon name="upload" />
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
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
  const [creating, setCreating] = useState(false);

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
          {!creating && (
            <button type="button" className="btn btn--ghost push-left" onClick={() => setCreating(true)}>
              <Icon name="plus" /> {t('newTeam')}
            </button>
          )}
          {/* While the new-team form is open, its Create button is the primary action. */}
          <button type="button" className={`btn ${creating ? 'btn--ghost' : 'btn--primary'}`} onClick={onClose}>{t('close')}</button>
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
      {creating && <NewTeamForm onDone={() => setCreating(false)} />}
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

/** New team: a name and what to start from (an empty team, or a copy of an existing one). */
function NewTeamForm({ onDone }: { onDone: () => void }) {
  const { data, setData } = useStore();
  const { t } = useI18n();
  const [from, setFrom] = useState('');
  const defaultName = (source: string) => {
    const team = data.teams.find((tm) => tm.id === source);
    return team ? t('copyOfTeam', { name: team.name }) : `${t('newTeamName')} ${data.teams.length + 1}`;
  };
  const [name, setName] = useState(() => defaultName(''));
  const [named, setNamed] = useState(false); // the user typed a name: keep it when the source changes

  const create = () => {
    const clean = name.trim().slice(0, 60) || defaultName(from);
    const source = data.teams.find((tm) => tm.id === from);
    const team = source ? copyTeam(source, clean) : emptyTeam(clean);
    setData({ ...data, teams: [...data.teams, team], activeTeamId: team.id });
    onDone();
  };

  return (
    <form
      className="field new-team"
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <span className="label">{t('newTeam')}</span>
      <input
        className="input"
        value={name}
        maxLength={60}
        aria-label={t('team')}
        autoFocus
        onChange={(e) => {
          setName(e.target.value);
          setNamed(true);
        }}
      />
      <label className="new-team-from">
        <span className="muted small">{t('startFrom')}</span>
        <select
          className="input"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            if (!named) setName(defaultName(e.target.value));
          }}
        >
          <option value="">{t('emptyTeamOption')}</option>
          {data.teams.map((tm) => (
            <option key={tm.id} value={tm.id}>{t('copyOfTeam', { name: tm.name })}</option>
          ))}
        </select>
      </label>
      <div className="new-team-actions">
        <button type="button" className="btn btn--ghost" onClick={onDone}>{t('cancel')}</button>
        <button type="submit" className="btn btn--primary">
          <Icon name="plus" /> {t('createTeam')}
        </button>
      </div>
    </form>
  );
}
