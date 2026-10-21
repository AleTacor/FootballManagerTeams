import type { Lang, Phase, PosCode } from './types';

/**
 * FM26 roles. In FM26 every tactic slot has an In Possession role and an
 * Out of Possession role. Names follow the FM26 role list. Spanish names come
 * from the Spanish game UI where known (screenshots, footballmanager.com/es);
 * the rest follow its patterns (Tracking = "marcador", Outlet = "de salida",
 * Stopping = "contundente", No-Nonsense = "práctico"). Spanish abbreviations are ours.
 */
interface RoleDef {
  en: string;
  enAbbr: string;
  es: string;
  esAbbr: string;
}

export const ROLES: Record<string, RoleDef> = {
  gk: { en: 'Goalkeeper', enAbbr: 'GK', es: 'Portero', esAbbr: 'POR' },
  bpgk: { en: 'Ball-Playing Goalkeeper', enAbbr: 'BPGK', es: 'Portero con toque', esAbbr: 'PCT' },
  nngk: { en: 'No-Nonsense Goalkeeper', enAbbr: 'NNGK', es: 'Portero práctico', esAbbr: 'PPR' },
  lhk: { en: 'Line-Holding Keeper', enAbbr: 'LHK', es: 'Portero de línea', esAbbr: 'PDL' },
  sk: { en: 'Sweeper Keeper', enAbbr: 'SK', es: 'Portero líbero', esAbbr: 'PL' },

  cb: { en: 'Centre-Back', enAbbr: 'CB', es: 'Central', esAbbr: 'DFC' },
  bpcb: { en: 'Ball-Playing Centre-Back', enAbbr: 'BPCB', es: 'Central con toque', esAbbr: 'CCT' },
  nncb: { en: 'No-Nonsense Centre-Back', enAbbr: 'NNCB', es: 'Central práctico', esAbbr: 'CPR' },
  acb: { en: 'Advanced Centre-Back', enAbbr: 'ACB', es: 'Central adelantado', esAbbr: 'CAD' },
  ocb: { en: 'Overlapping Centre-Back', enAbbr: 'OCB', es: 'Central con proyección ofensiva', esAbbr: 'CPO' },
  wcb: { en: 'Wide Centre-Back', enAbbr: 'WCB', es: 'Central lateral', esAbbr: 'CLA' },
  ccb: { en: 'Covering Centre-Back', enAbbr: 'CCB', es: 'Central de cobertura', esAbbr: 'CCO' },
  scb: { en: 'Stopping Centre-Back', enAbbr: 'SCB', es: 'Central contundente', esAbbr: 'CCN' },

  fb: { en: 'Full-Back', enAbbr: 'FB', es: 'Lateral', esAbbr: 'LAT' },
  ifb: { en: 'Inside Full-Back', enAbbr: 'IFB', es: 'Lateral interior', esAbbr: 'LIN' },
  hfb: { en: 'Holding Full-Back', enAbbr: 'HFB', es: 'Lateral de contención', esAbbr: 'LCO' },
  pfb: { en: 'Pressing Full-Back', enAbbr: 'PFB', es: 'Lateral presionante', esAbbr: 'LPR' },
  wb: { en: 'Wing-Back', enAbbr: 'WB', es: 'Carrilero', esAbbr: 'CAR' },
  iwb: { en: 'Inside Wing-Back', enAbbr: 'IWB', es: 'Carrilero interior', esAbbr: 'CIN' },
  pwb: { en: 'Playmaking Wing-Back', enAbbr: 'PWB', es: 'Carrilero creativo', esAbbr: 'CCR' },
  awb: { en: 'Advanced Wing-Back', enAbbr: 'AWB', es: 'Carrilero adelantado', esAbbr: 'CAD' },
  hwb: { en: 'Holding Wing-Back', enAbbr: 'HWB', es: 'Carrilero de contención', esAbbr: 'CCO' },
  prwb: { en: 'Pressing Wing-Back', enAbbr: 'PrWB', es: 'Carrilero presionante', esAbbr: 'CPR' },

  dm: { en: 'Defensive Midfielder', enAbbr: 'DM', es: 'Mediocentro', esAbbr: 'MCD' },
  dlp: { en: 'Deep-Lying Playmaker', enAbbr: 'DLP', es: 'Pivote organizador', esAbbr: 'PO' },
  hb: { en: 'Half-Back', enAbbr: 'HB', es: 'Medio cierre', esAbbr: 'MCI' },
  b2b: { en: 'Box-to-Box Midfielder', enAbbr: 'BBM', es: 'Centrocampista todoterreno', esAbbr: 'CTT' },
  b2bp: { en: 'Box-to-Box Playmaker', enAbbr: 'BBP', es: 'Organizador todoterreno', esAbbr: 'OTT' },
  ddm: { en: 'Dropping Defensive Midfielder', enAbbr: 'DDM', es: 'Mediocentro de repliegue', esAbbr: 'MRE' },
  sdm: { en: 'Screening Defensive Midfielder', enAbbr: 'SDM', es: 'Mediocentro de pantalla', esAbbr: 'MPA' },
  wcdm: { en: 'Wide Covering Defensive Midfielder', enAbbr: 'WCDM', es: 'Mediocentro de cobertura por banda', esAbbr: 'MCB' },
  pdm: { en: 'Pressing Defensive Midfielder', enAbbr: 'PDM', es: 'Mediocentro presionante', esAbbr: 'MPR' },

  cm: { en: 'Central Midfielder', enAbbr: 'CM', es: 'Centrocampista', esAbbr: 'MC' },
  mp: { en: 'Midfield Playmaker', enAbbr: 'MP', es: 'Centrocampista organizador', esAbbr: 'COR' },
  wcm: { en: 'Wide Central Midfielder', enAbbr: 'WCM', es: 'Centrocampista abierto', esAbbr: 'CAB' },
  chm: { en: 'Channel Midfielder', enAbbr: 'ChM', es: 'Centrocampista buscaespacios', esAbbr: 'CBE' },
  pcm: { en: 'Pressing Central Midfielder', enAbbr: 'PCM', es: 'Centrocampista presionante', esAbbr: 'CPR' },
  scm: { en: 'Screening Central Midfielder', enAbbr: 'SCM', es: 'Centrocampista de pantalla', esAbbr: 'CPA' },
  wccm: { en: 'Wide Covering Central Midfielder', enAbbr: 'WCCM', es: 'Centrocampista de cobertura por banda', esAbbr: 'CCB' },

  wm: { en: 'Wide Midfielder', enAbbr: 'WM', es: 'Centrocampista de banda', esAbbr: 'CBA' },
  twm: { en: 'Tracking Wide Midfielder', enAbbr: 'TWM', es: 'Centrocampista de banda marcador', esAbbr: 'CBM' },
  wowm: { en: 'Wide Outlet Wide Midfielder', enAbbr: 'WOWM', es: 'Centrocampista de banda de salida', esAbbr: 'CBS' },
  w: { en: 'Winger', enAbbr: 'W', es: 'Extremo', esAbbr: 'EXT' },
  iw: { en: 'Inside Winger', enAbbr: 'IW', es: 'Extremo por dentro', esAbbr: 'EPD' },
  pw: { en: 'Playmaking Winger', enAbbr: 'PW', es: 'Extremo organizador', esAbbr: 'EOR' },
  if: { en: 'Inside Forward', enAbbr: 'IF', es: 'Delantero interior', esAbbr: 'DIN' },
  wf: { en: 'Wide Forward', enAbbr: 'WF', es: 'Delantero abierto', esAbbr: 'DAB' },
  iow: { en: 'Inside Outlet Winger', enAbbr: 'IOW', es: 'Extremo por dentro con salida', esAbbr: 'EDS' },
  tw: { en: 'Tracking Winger', enAbbr: 'TW', es: 'Extremo marcador', esAbbr: 'EMA' },
  wow: { en: 'Wide Outlet Winger', enAbbr: 'WOW', es: 'Extremo de salida', esAbbr: 'ESA' },

  am: { en: 'Attacking Midfielder', enAbbr: 'AM', es: 'Mediapunta', esAbbr: 'MP' },
  ap: { en: 'Advanced Playmaker', enAbbr: 'AP', es: 'Organizador adelantado', esAbbr: 'OAD' },
  fr: { en: 'Free Role', enAbbr: 'FR', es: 'Rol libre', esAbbr: 'LIB' },
  ss: { en: 'Second Striker', enAbbr: 'SS', es: 'Segundo delantero', esAbbr: 'SD' },
  coam: { en: 'Central Outlet Attacking Midfielder', enAbbr: 'COAM', es: 'Mediapunta de salida central', esAbbr: 'MSC' },
  soam: { en: 'Splitting Outlet Attacking Midfielder', enAbbr: 'SOAM', es: 'Mediapunta de salida en ruptura', esAbbr: 'MSR' },
  tam: { en: 'Tracking Attacking Midfielder', enAbbr: 'TAM', es: 'Mediapunta marcador', esAbbr: 'MMA' },

  cf: { en: 'Centre Forward', enAbbr: 'CF', es: 'Delantero centro', esAbbr: 'DC' },
  chf: { en: 'Channel Forward', enAbbr: 'ChF', es: 'Delantero buscaespacios', esAbbr: 'DBE' },
  dlf: { en: 'Deep-Lying Forward', enAbbr: 'DLF', es: 'Delantero de apoyo', esAbbr: 'DAP' },
  f9: { en: 'False Nine', enAbbr: 'F9', es: 'Falso nueve', esAbbr: 'F9' },
  p: { en: 'Poacher', enAbbr: 'P', es: 'Ariete', esAbbr: 'ARI' },
  tf: { en: 'Target Forward', enAbbr: 'TF', es: 'Delantero objetivo', esAbbr: 'DOB' },
  cocf: { en: 'Central Outlet Centre Forward', enAbbr: 'COCF', es: 'Delantero de salida central', esAbbr: 'DSC' },
  socf: { en: 'Splitting Outlet Centre Forward', enAbbr: 'SOCF', es: 'Delantero de salida en ruptura', esAbbr: 'DSR' },
  tcf: { en: 'Tracking Centre Forward', enAbbr: 'TCF', es: 'Delantero marcador', esAbbr: 'DMA' },
};

type RoleGroup = 'gk' | 'cb' | 'fb' | 'wb' | 'dm' | 'cm' | 'wm' | 'am' | 'w' | 'st';

const ROLE_GROUP: Record<PosCode, RoleGroup> = {
  GK: 'gk', DC: 'cb', DL: 'fb', DR: 'fb', WBL: 'wb', WBR: 'wb', DM: 'dm',
  MC: 'cm', ML: 'wm', MR: 'wm', AMC: 'am', AML: 'w', AMR: 'w', ST: 'st',
};

const ROLES_BY_GROUP: Record<RoleGroup, Record<Phase, string[]>> = {
  gk: { ip: ['gk', 'bpgk', 'nngk'], oop: ['gk', 'lhk', 'sk'] },
  cb: { ip: ['cb', 'bpcb', 'nncb', 'acb', 'ocb', 'wcb'], oop: ['cb', 'ccb', 'scb'] },
  fb: { ip: ['fb', 'ifb', 'wb', 'iwb', 'pwb'], oop: ['fb', 'hfb', 'pfb'] },
  wb: { ip: ['wb', 'iwb', 'pwb', 'awb'], oop: ['wb', 'hwb', 'prwb'] },
  dm: { ip: ['dm', 'dlp', 'hb', 'b2b', 'b2bp'], oop: ['dm', 'ddm', 'sdm', 'wcdm', 'pdm'] },
  cm: { ip: ['cm', 'mp', 'wcm', 'b2b', 'b2bp', 'chm'], oop: ['cm', 'pcm', 'scm', 'wccm'] },
  wm: { ip: ['wm', 'wcm', 'w', 'iw', 'pw'], oop: ['wm', 'twm', 'wowm'] },
  am: { ip: ['am', 'ap', 'chm', 'fr', 'ss'], oop: ['am', 'coam', 'soam', 'tam'] },
  w: { ip: ['w', 'iw', 'pw', 'if', 'wf'], oop: ['w', 'iow', 'tw', 'wow'] },
  st: { ip: ['cf', 'chf', 'dlf', 'f9', 'p', 'tf'], oop: ['cf', 'cocf', 'socf', 'tcf'] },
};

export const CUSTOM_PREFIX = 'custom:';

export function rolesFor(pos: PosCode, phase: Phase): string[] {
  return ROLES_BY_GROUP[ROLE_GROUP[pos]][phase];
}

/** The role FM26 gives a position by default: the generic one named after it, first in the list. */
export function defaultRole(pos: PosCode, phase: Phase): string {
  return rolesFor(pos, phase)[0];
}

/** Keeps a role only if it is valid for the new position (custom roles always survive). */
export function roleFits(role: string | null, pos: PosCode, phase: Phase): boolean {
  if (!role) return true;
  if (role.startsWith(CUSTOM_PREFIX)) return true;
  return rolesFor(pos, phase).includes(role);
}

export function roleName(role: string | null, lang: Lang): string {
  if (!role) return '';
  if (role.startsWith(CUSTOM_PREFIX)) return role.slice(CUSTOM_PREFIX.length);
  const def = ROLES[role];
  return def ? def[lang] : role;
}

export function roleAbbr(role: string | null, lang: Lang): string {
  if (!role) return '';
  if (role.startsWith(CUSTOM_PREFIX)) {
    const words = role.slice(CUSTOM_PREFIX.length).split(/[\s-]+/).filter(Boolean);
    return words.map((w) => w[0]).join('').slice(0, 4).toUpperCase();
  }
  const def = ROLES[role];
  if (!def) return role.slice(0, 4).toUpperCase();
  return lang === 'es' ? def.esAbbr : def.enAbbr;
}
