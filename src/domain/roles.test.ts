import { describe, expect, it } from 'vitest';
import { POS_CODES } from './positions';
import { CUSTOM_PREFIX, defaultRole, ROLES, roleAbbr, roleFits, roleName, rolesFor } from './roles';
import type { Lang, Phase, PosCode } from './types';

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

  it('matches the role lists of the Spanish game UI', () => {
    expect(rolesFor('DC', 'oop')).toEqual(['cb', 'ccb', 'scb', 'wcb', 'cwcb', 'swcb']);
    expect(rolesFor('MC', 'ip')).toEqual(['cm', 'mp', 'wcm', 'chm', 'ap', 'am']);
    expect(rolesFor('MC', 'ip')).not.toContain('b2b');
    expect(rolesFor('DM', 'ip')).toContain('b2b');
    expect(rolesFor('MR', 'ip')).toEqual(['wm', 'w', 'iw', 'pw']);
    expect(roleName('wf', 'es')).toBe('Delantero escorado');
    expect(roleName('tf', 'es')).toBe('Hombre objetivo');
  });

  it('separates in- and out-of-possession roles (FM26)', () => {
    expect(rolesFor('GK', 'oop')).toContain('sk');
    expect(rolesFor('GK', 'ip')).not.toContain('sk');
    expect(rolesFor('DM', 'oop')).toContain('pdm');
    expect(rolesFor('ST', 'ip')).toContain('f9');
  });
});

describe('FM27 roles', () => {
  // Role lists read from the Spanish FM27 UI. FM27 sorts them by the player's rating, so compare sets.
  const fm27: Record<Phase, Record<string, string[]>> = {
    ip: {
      GK: ['bpgk', 'nngk', 'gk'],
      DC: ['bpcb', 'acb', 'ocb', 'wcb', 'nncb', 'cb'],
      DL: ['wb', 'fb', 'ifb', 'iwb', 'pwb'],
      WBL: ['wb', 'awb', 'iwb', 'pwb'],
      DM: ['hb', 'dm', 'dlp', 'b2b', 'b2bp'],
      MC: ['ap', 'am', 'chm', 'mp', 'wcm', 'cm'],
      MR: ['iw', 'w', 'pw', 'wm'],
      AMC: ['ap', 'chm', 'ss', 'fr', 'am'],
      AMR: ['iw', 'wf', 'w', 'pw', 'if'],
      ST: ['chf', 'cf', 'dlf', 'p', 'tf', 'f9'],
    },
    oop: {
      GK: ['sk', 'gk', 'lhk'],
      DC: ['wcb', 'cb', 'cwcb', 'swcb', 'ccb', 'scb'],
      DR: ['pfb', 'fb', 'hfb'],
      WBR: ['prwb', 'wb', 'hwb'],
      DM: ['wcdm', 'sdm', 'pdm', 'ddm', 'dm'],
      MC: ['pcm', 'wccm', 'cm', 'scm'],
      ML: ['wm', 'twm', 'wowm'],
      AMC: ['tam', 'am', 'soam', 'coam'],
      AMR: ['w', 'tw', 'wow', 'iow'],
      ST: ['cf', 'tcf', 'socf', 'cocf'],
    },
  };

  it('are the same lists as FM26 in both phases', () => {
    for (const phase of phases) {
      for (const [pos, roles] of Object.entries(fm27[phase])) {
        expect([...rolesFor(pos as PosCode, phase)].sort(), `${pos}/${phase}`).toEqual([...roles].sort());
      }
    }
  });

  it('use the English names of the FM27 game UI', () => {
    expect(rolesFor('GK', 'oop').map((r) => roleName(r, 'en')).sort()).toEqual(['Goalkeeper', 'Line-Holding Goalkeeper', 'Sweeper Keeper']);
    expect(rolesFor('DM', 'ip').map((r) => roleName(r, 'en')).sort()).toEqual([
      'Box-To-Box Midfielder', 'Box-To-Box Playmaker', 'Deep-Lying Playmaker', 'Defensive Midfielder', 'Half Back',
    ]);
  });
});

describe('default roles', () => {
  it('uses the generic FM26 role of each position in both phases', () => {
    const expected = { GK: 'gk', DC: 'cb', DL: 'fb', WBR: 'wb', DM: 'dm', MC: 'cm', MR: 'wm', AMC: 'am', AML: 'w', ST: 'cf' } as const;
    for (const [pos, role] of Object.entries(expected)) {
      for (const phase of phases) expect(defaultRole(pos as keyof typeof expected, phase), `${pos}/${phase}`).toBe(role);
    }
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
    expect(roleName('sk', 'es')).toBe('Portero cierre');
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
