import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Familiarity, Lang, PosCode } from '../domain/types';
import { FAMILIARITY_LABELS, POS_LABELS, POS_NAMES, STRINGS, type StringKey } from './strings';

interface I18n {
  lang: Lang;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  pos: (code: PosCode) => string;
  /** Full position name ("Centre Back"), for titles and tooltips. */
  posName: (code: PosCode) => string;
  fam: (f: Familiarity) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo<I18n>(
    () => ({
      lang,
      t: (key, vars) => {
        let s: string = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
        return s;
      },
      pos: (code) => POS_LABELS[lang][code],
      posName: (code) => POS_NAMES[lang][code],
      fam: (f) => FAMILIARITY_LABELS[lang][f],
    }),
    [lang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}
