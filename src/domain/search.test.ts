import { describe, expect, it } from 'vitest';
import { foldText, matchesQuery } from './search';

describe('search', () => {
  it('ignores accent marks and case', () => {
    expect(foldText('José Núñez')).toBe('jose nunez');
    expect(foldText('Gonçalo Göçmen Fernão')).toBe('goncalo gocmen fernao');
    expect(foldText('Ødegaard Błaszczykowski Straße')).toBe('odegaard blaszczykowski strasse');
  });

  it('matches in both directions', () => {
    expect(matchesQuery('José Núñez', 'jose')).toBe(true);
    expect(matchesQuery('Jose Nunez', 'NÚÑ')).toBe(true);
    expect(matchesQuery('Martin Ødegaard', 'odeg')).toBe(true);
    expect(matchesQuery('José Núñez', 'pepe')).toBe(false);
  });

  it('matches everything with an empty or blank query', () => {
    expect(matchesQuery('Anyone', '')).toBe(true);
    expect(matchesQuery('Anyone', '   ')).toBe(true);
  });
});
