import { matchRank, MatchRank, normalizeSearchText, rankByRelevance } from '../search-text';

/**
 * Os dois defeitos que motivaram este módulo foram encontrados usando o app no
 * celular, não em teste. Os casos abaixo são exatamente aqueles.
 */
describe('normalizeSearchText', () => {
  it.each([
    ['Feijão', 'feijao'],
    ['AÇÚCAR', 'acucar'],
    ['Pão, aveia, forma', 'pao aveia forma'],
    ['  Arroz   integral  ', 'arroz integral'],
    ['Supino Reto com Barra - Pegada Média', 'supino reto com barra pegada media'],
    ['Ovo, de galinha, cozido/10minutos', 'ovo de galinha cozido 10minutos'],
  ])('%s vira %s', (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected);
  });

  it('deixa quem digita sem acento achar o que está acentuado', () => {
    // O caso real: teclado de celular, ninguém acentua.
    expect(normalizeSearchText('Feijão tropeiro mineiro')).toContain(
      normalizeSearchText('feijao'),
    );
  });

  it('faz a vírgula da TACO deixar de atrapalhar', () => {
    // "Arroz, tipo 1, cozido" não casava com "arroz tipo 1".
    expect(normalizeSearchText('Arroz, tipo 1, cozido')).toContain(
      normalizeSearchText('arroz tipo 1'),
    );
  });
});

describe('matchRank', () => {
  it('ordena exato antes de prefixo, prefixo antes de palavra, palavra antes de contido', () => {
    expect(matchRank('supino', 'supino')).toBe(MatchRank.Exact);
    expect(matchRank('supino reto com barra', 'supino')).toBe(MatchRank.Prefix);
    expect(matchRank('arremesso supino com dois bracos', 'supino')).toBe(MatchRank.WordPrefix);
    expect(matchRank('maquinasupinovertical', 'supino')).toBe(MatchRank.Contains);
    expect(matchRank('agachamento com barra', 'supino')).toBe(MatchRank.None);
  });
});

describe('rankByRelevance', () => {
  const exercicios = [
    { name: 'Arremesso Supino com Dois Braços Acima da Cabeça' },
    { name: 'Arremesso de Peito Supino' },
    { name: 'Supino Reto com Barra e Pegada Larga' },
    { name: 'Supino Reto com Barra - Pegada Média' },
    { name: 'Agachamento com Barra' },
  ];

  it('põe o que começa com o termo na frente do que só o contém', () => {
    // O defeito original: a ordenação alfabética trazia "Arremesso Supino"
    // primeiro, e o supino reto ficava escondido.
    const resultado = rankByRelevance(exercicios, 'supino', (e) => e.name, 5);
    expect(resultado[0].name).toContain('Supino Reto');
    expect(resultado.at(-1)?.name).toContain('Arremesso');
  });

  it('entre dois prefixos, prefere o nome mais curto — costuma ser o genérico', () => {
    const resultado = rankByRelevance(exercicios, 'supino reto', (e) => e.name, 2);
    expect(resultado[0].name).toBe('Supino Reto com Barra - Pegada Média');
  });

  it('descarta quem não casa', () => {
    const resultado = rankByRelevance(exercicios, 'supino', (e) => e.name, 10);
    expect(resultado.map((e) => e.name)).not.toContain('Agachamento com Barra');
  });

  it('acha sem acento', () => {
    const alimentos = [{ name: 'Feijão tropeiro mineiro' }, { name: 'Arroz, tipo 1, cozido' }];
    expect(rankByRelevance(alimentos, 'feijao', (f) => f.name, 5)).toHaveLength(1);
  });

  it('respeita o limite', () => {
    expect(rankByRelevance(exercicios, 'supino', (e) => e.name, 2)).toHaveLength(2);
  });

  it('devolve os primeiros sem ranquear quando não há termo', () => {
    expect(rankByRelevance(exercicios, '', (e) => e.name, 2)).toHaveLength(2);
  });
});
