import { useState } from 'react';
import { CUSTOM_PREFIX, roleName, rolesFor } from '../domain/roles';
import type { Phase, PosCode } from '../domain/types';
import { useI18n } from '../i18n/I18n';

const CUSTOM = '__custom__';

export function RoleSelect({
  phase, pos, value, onChange, id,
}: {
  phase: Phase; pos: PosCode; value: string | null; onChange: (role: string | null) => void; id?: string;
}) {
  const { t, lang } = useI18n();
  const options = rolesFor(pos, phase);
  const isCustom = !!value?.startsWith(CUSTOM_PREFIX);
  const [editing, setEditing] = useState(isCustom);
  const [text, setText] = useState(isCustom ? value!.slice(CUSTOM_PREFIX.length) : '');

  // Follow outside changes of the role (undo, another slot): adjusted during render, no effect.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setEditing(isCustom);
    setText(isCustom ? value!.slice(CUSTOM_PREFIX.length) : '');
  }

  const selectValue = editing ? CUSTOM : value && options.includes(value) ? value : '';

  return (
    <div className="role-select">
      <select
        id={id}
        className="input"
        value={selectValue}
        aria-label={t('role')}
        onChange={(e) => {
          const v = e.target.value;
          if (v === CUSTOM) {
            setEditing(true);
            return;
          }
          setEditing(false);
          onChange(v || null);
        }}
      >
        <option value="">{t('noRole')}</option>
        {options.map((r) => (
          <option key={r} value={r}>{roleName(r, lang)}</option>
        ))}
        <option value={CUSTOM}>{t('customRole')}</option>
      </select>
      {editing && (
        <input
          className="input"
          value={text}
          maxLength={60}
          placeholder={t('customRolePlaceholder')}
          aria-label={t('customRolePlaceholder')}
          autoFocus={!isCustom}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => onChange(text.trim() ? CUSTOM_PREFIX + text.trim() : null)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      )}
    </div>
  );
}
