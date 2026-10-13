import { describe, expect, it } from 'vitest';
import { POS_CODES } from './positions';
import { CUSTOM_PREFIX, ROLES, roleAbbr, roleFits, roleName, rolesFor } from './roles';
import type { Lang, Phase } from './types';

const phases: Phase[] = ['ip', 'oop'];
const langs: Lang[] = ['es', 'en'];

describe('role catalogue', () => {
  it('has roles for every position and phase, all defined in ROLES', () => {
    for (const pos of POS_CODES) {
      for (const phase of phases) {
        const list = rolesFor(pos, phase);
        expect(list.length).toBeGreaterThan(0);
        for (const id of list) expect(ROLES[id], `${pos}/${phase}: ${id}`).toBeDefined();
        expect(new Set(list).size).toBe(list.length);
      }
    }
  });

  it('has names and short abbreviations in both languages', () => {
    for (const [id, def] of Object.entries(ROLES)) {
      expect(def.en.trim(), id).not.toBe('');
      expect(def.es.trim(), id).not.toBe('');
      expect(def.enAbbr.length, id).toBeLessThanOrEqual(4);
      expect(def.esAbbr.length, id).toBeLessThanOrEqual(4);
    }
  });

  it('uses distinct abbreviations within each position and phase', () => {
    for (const pos of POS_CODES) {
      for (const phase of phases) {
        for (const lang of langs) {
          const abbrs = rolesFor(pos, phase).map((r) => roleAbbr(r, lang));
          expect(new Set(abbrs).size, `${pos}/${phase}/${lang}: ${abbrs.join(',')}`).toBe(abbrs.length);
        }
      }
    }
  });

  it('separates in- and out-of-possession roles (FM26)', () => {
    expect(rolesFor('GK', 'oop')).toContain('sk');
    expect(rolesFor('GK', 'ip')).not.toContain('sk');
    expect(rolesFor('DM', 'oop')).toContain('pdm');
    expect(rolesFor('ST', 'ip')).toContain('f9');
  });
});

describe('role helpers', () => {
  it('checks whether a role fits a position and phase', () => {
    expect(roleFits('bpcb', 'DC', 'ip')).toBe(true);
    expect(roleFits('bpcb', 'DC', 'oop')).toBe(false);
    expect(roleFits('bpcb', 'ST', 'ip')).toBe(false);
    expect(roleFits(null, 'ST', 'ip')).toBe(true);
    expect(roleFits(`${CUSTOM_PREFIX}Anything`, 'GK', 'oop')).toBe(true);
  });

  it('translates names and abbreviations', () => {
    expect(roleName('sk', 'en')).toBe('Sweeper Keeper');
    expect(roleName('sk', 'es')).toBe('Portero líbero');
    expect(roleAbbr('cf', 'en')).toBe('CF');
    expect(roleAbbr('cf', 'es')).toBe('DC');
    expect(roleName(null, 'en')).toBe('');
    expect(roleAbbr(null, 'es')).toBe('');
  });

  it('handles custom and unknown roles', () => {
    expect(roleName('custom:Mi rol', 'en')).toBe('Mi rol');
    expect(roleAbbr('custom:Box-to-box killer', 'en')).toBe('BTBK');
    expect(roleAbbr('custom:Ancla', 'es')).toBe('A');
    expect(roleName('legacy-role', 'en')).toBe('legacy-role');
    expect(roleAbbr('legacy-role', 'en')).toBe('LEGA');
  });
});
