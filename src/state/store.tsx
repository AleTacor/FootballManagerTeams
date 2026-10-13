import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData, Team } from '../domain/types';
import { loadData, saveData } from './storage';

const HISTORY_LIMIT = 50;

interface Store {
  data: AppData;
  team: Team;
  /** Replace the whole app data (records an undo step). */
  setData: (next: AppData) => void;
  /** Update the active team (records an undo step). */
  updateTeam: (fn: (team: Team) => Team) => void;
  /** Change settings without recording an undo step. */
  setSettings: (patch: Partial<AppData['settings']>) => void;
  undo: () => void;
  canUndo: boolean;
}

const Ctx = createContext<Store | null>(null);

const activeTeam = (d: AppData) => d.teams.find((t) => t.id === d.activeTeamId) ?? d.teams[0];

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setDataState] = useState<AppData>(loadData);
  const current = useRef(data);
  const history = useRef<AppData[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  useEffect(() => saveData(data), [data]);

  const commit = useCallback((next: AppData, record: boolean) => {
    const prev = current.current;
    if (next === prev) return;
    if (record) {
      history.current = [...history.current.slice(-(HISTORY_LIMIT - 1)), prev];
      setCanUndo(true);
    }
    current.current = next;
    setDataState(next);
  }, []);

  const setData = useCallback((next: AppData) => commit(next, true), [commit]);

  const updateTeam = useCallback(
    (fn: (team: Team) => Team) => {
      const prev = current.current;
      const team = activeTeam(prev);
      const nextTeam = fn(team);
      if (nextTeam === team) return;
      commit({ ...prev, teams: prev.teams.map((t) => (t.id === team.id ? nextTeam : t)) }, true);
    },
    [commit],
  );

  const setSettings = useCallback(
    (patch: Partial<AppData['settings']>) => {
      const prev = current.current;
      commit({ ...prev, settings: { ...prev.settings, ...patch } }, false);
    },
    [commit],
  );

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (!prev) return;
    setCanUndo(history.current.length > 0);
    // Keep the current language/theme: undo is for squad changes only.
    commit({ ...prev, settings: current.current.settings }, false);
  }, [commit]);

  const value = useMemo(
    () => ({ data, team: activeTeam(data), setData, updateTeam, setSettings, undo, canUndo }),
    [data, setData, updateTeam, setSettings, undo, canUndo],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}
