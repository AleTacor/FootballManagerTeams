import { uid } from '../domain/logic';
import type { Assignment, Familiarity, Phase, Player, PosCode, SlotId, Team } from '../domain/types';

/** Fictional example squad (4-2-3-1 in possession, 4-4-2 out of possession). */
type P = [name: string, positions: Partial<Record<PosCode, Familiarity>>, oopOverride?: Partial<Record<PosCode, Familiarity>>];

const SQUAD: P[] = [
  ['Iker Salvatierra', { GK: 'natural' }],
  ['Tomás Bergkamp-Ruiz', { GK: 'natural' }],
  ['Mateo Llorente', { DR: 'natural', WBR: 'accomplished', DC: 'unconvincing' }],
  ['Jules Okonkwo', { DC: 'natural', DM: 'competent' }],
  ['Arnau Vidal', { DC: 'natural' }],
  ['Kasper Lindqvist', { DL: 'natural', WBL: 'natural', ML: 'competent' }],
  ['Rodrigo Almeida', { DM: 'natural', MC: 'accomplished', DC: 'competent' }],
  ['Luka Maričević', { MC: 'natural', DM: 'accomplished', AMC: 'competent' }],
  ['Yannick Dufresne', { AMR: 'natural', MR: 'accomplished', ST: 'unconvincing' }],
  ['Álvaro Montenegro', { AMC: 'natural', MC: 'competent', ST: 'competent' }, { ST: 'accomplished', AMC: 'natural' }],
  ['Ibrahima Sarr', { AML: 'natural', ML: 'accomplished', AMR: 'competent' }],
  ['Santiago Ferreyra', { ST: 'natural' }],
  ['Noah van der Berg', { DC: 'accomplished', DR: 'competent' }],
  ['Pau Castells', { DL: 'accomplished', DC: 'unconvincing' }],
  ['Emeka Adeyemi', { DM: 'accomplished', MC: 'natural' }],
  ['Hugo Lemaire', { MC: 'natural', AMC: 'accomplished' }],
  ['Daniel Ortega', { AMR: 'accomplished', AML: 'accomplished', MR: 'competent' }],
  ['Marco Bellandi', { ST: 'natural', AMC: 'unconvincing' }],
  ['Óscar Villanueva', { DR: 'accomplished', WBR: 'natural' }],
  ['Theo Kowalczyk', { GK: 'natural' }],
  ['Rafael Quintero de la Fuente', { MC: 'competent', DM: 'unknown', DC: 'awkward' }],
  ['Samuel Nkemelu', { AML: 'competent', ST: 'accomplished' }],
  ['Joan Puigdemunt', { DC: 'natural', DL: 'competent' }],
  ['Elias Grünwald', { AMC: 'accomplished', AMR: 'competent', MC: 'competent' }],
  ['Bruno Tavares', { DL: 'natural', WBL: 'accomplished' }],
];

export function sampleTeam(name: string): Team {
  const players: Player[] = SQUAD.map(([n, pos, oop]) => ({
    id: uid(),
    name: n,
    positions: { ip: { ...pos }, oop: { ...(oop ?? pos) } },
  }));
  const byName = (n: string) => players.find((p) => p.name.startsWith(n))!.id;
  const assignments: Assignment[] = [];
  const add = (who: string, phase: Phase, tier: Assignment['tier'], slot: SlotId, role: string | null) =>
    assignments.push({ id: uid(), playerId: byName(who), phase, tier, slot, role });

  // Starters, in possession (4-2-3-1)
  add('Iker', 'ip', 'starter', 'GK', 'bpgk');
  add('Mateo', 'ip', 'starter', 'DR', 'iwb');
  add('Jules', 'ip', 'starter', 'DCR', 'bpcb');
  add('Arnau', 'ip', 'starter', 'DCL', 'cb');
  add('Kasper', 'ip', 'starter', 'DL', 'wb');
  add('Rodrigo', 'ip', 'starter', 'DMR', 'dlp');
  add('Luka', 'ip', 'starter', 'DML', 'b2b');
  add('Yannick', 'ip', 'starter', 'AMR', 'if');
  add('Álvaro', 'ip', 'starter', 'AMCC', 'ap');
  add('Ibrahima', 'ip', 'starter', 'AML', 'iw');
  add('Santiago', 'ip', 'starter', 'STC', 'chf');
  // Starters, out of possession (4-4-2)
  add('Iker', 'oop', 'starter', 'GK', 'sk');
  add('Mateo', 'oop', 'starter', 'DR', 'fb');
  add('Jules', 'oop', 'starter', 'DCR', 'ccb');
  add('Arnau', 'oop', 'starter', 'DCL', 'scb');
  add('Kasper', 'oop', 'starter', 'DL', 'fb');
  add('Rodrigo', 'oop', 'starter', 'MCR', 'scm');
  add('Luka', 'oop', 'starter', 'MCL', 'pcm');
  add('Yannick', 'oop', 'starter', 'MR', 'twm');
  add('Ibrahima', 'oop', 'starter', 'ML', 'wm');
  add('Álvaro', 'oop', 'starter', 'STL', 'tcf');
  add('Santiago', 'oop', 'starter', 'STR', 'cf');
  // Main subs (in possession)
  add('Tomás', 'ip', 'main', 'GK', 'gk');
  add('Noah', 'ip', 'main', 'DCR', 'cb');
  add('Joan', 'ip', 'main', 'DCL', 'cb');
  add('Óscar', 'ip', 'main', 'DR', 'wb');
  add('Bruno', 'ip', 'main', 'DL', 'wb');
  add('Emeka', 'ip', 'main', 'DMR', 'dm');
  add('Hugo', 'ip', 'main', 'DML', 'b2b');
  add('Daniel', 'ip', 'main', 'AMR', 'w');
  add('Elias', 'ip', 'main', 'AMCC', 'am');
  add('Samuel', 'ip', 'main', 'AML', null);
  add('Marco', 'ip', 'main', 'STC', 'p');
  // Aux subs and subs for slots not used by the starters
  add('Theo', 'ip', 'aux', 'GK', null);
  add('Pau', 'ip', 'aux', 'DL', null);
  add('Rafael', 'ip', 'aux', 'DMR', null);
  add('Luka', 'ip', 'main', 'MCC', 'mp'); // a starter who is also a sub elsewhere
  add('Hugo', 'ip', 'aux', 'AMCC', null);
  add('Rodrigo', 'ip', 'aux', 'DCC', null);
  // Main subs (out of possession)
  add('Tomás', 'oop', 'main', 'GK', 'gk');
  add('Noah', 'oop', 'main', 'DCR', 'cb');
  add('Joan', 'oop', 'main', 'DCL', 'cb');
  add('Óscar', 'oop', 'main', 'DR', 'hfb');
  add('Bruno', 'oop', 'main', 'DL', 'fb');
  add('Emeka', 'oop', 'main', 'MCR', 'scm');
  add('Hugo', 'oop', 'main', 'MCL', 'cm');
  add('Daniel', 'oop', 'main', 'MR', 'wm');
  add('Samuel', 'oop', 'main', 'ML', 'twm');
  add('Marco', 'oop', 'main', 'STR', 'cf');
  add('Elias', 'oop', 'main', 'STL', null);

  return { id: uid(), name, players, assignments };
}
