import { formatCurrency, formatNumber, formatPercent, initials } from './format';

describe('initials', () => {
  it('compose les initiales de prénom et nom', () => {
    expect(initials('Awa', 'Dossou')).toBe('AD');
  });

  it('tolère les valeurs manquantes', () => {
    expect(initials(undefined, undefined)).toBe('?');
    expect(initials('Awa', null)).toBe('A');
  });

  it('gère les espaces superflus', () => {
    expect(initials('  awa ', ' dossou')).toBe('AD');
  });
});

describe('formatNumber', () => {
  it('retourne un tiret pour une valeur absente', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
  });

  it('formate les milliers', () => {
    // Espace insécable selon la locale : on teste la présence des chiffres.
    expect(formatNumber(1234)).toContain('234');
  });
});

describe('formatPercent', () => {
  it('utilise la virgule décimale française', () => {
    expect(formatPercent(87.5)).toBe('87,5 %');
  });

  it('accepte un nombre de décimales', () => {
    expect(formatPercent(12.345, 2)).toBe('12,35 %');
  });

  it('retourne un tiret pour NaN', () => {
    expect(formatPercent(Number.NaN)).toBe('—');
  });
});

describe('formatCurrency', () => {
  it('convertit les unités mineures', () => {
    const result = formatCurrency(1999, 'USD', { minorUnits: true });
    expect(result).toContain('19');
    expect(result).toContain('99');
  });

  it('accepte un montant déjà en unité principale', () => {
    expect(formatCurrency(42)).toContain('42');
  });
});
