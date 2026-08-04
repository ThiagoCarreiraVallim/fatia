import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Invariante estrutural da #159: **dado corporal não entra no agregado.**
 *
 * "Nunca expor peso, medida ou alimentação em alerta de retenção" é uma frase de
 * issue; aqui ela vira uma varredura que o CI roda. O modo de falha que este
 * spec cobre não é um bug — é uma boa ideia: peso parado e diário alimentar
 * vazio são preditores de evasão *melhores* que frequência, e alguém vai propor
 * usá-los numa sexta-feira. A resposta precisa ser um teste vermelho, não uma
 * discussão que depende de quem está na revisão.
 *
 * Mesmo mecanismo de `tool-user-scoping.spec.ts`, que já provou funcionar neste
 * repositório: varredura de filesystem, falha dizendo arquivo e identificador.
 */

const INSIGHTS_SRC = resolve(__dirname, '..');

/**
 * Modelos e campos de dado corporal e alimentar do `schema.prisma`.
 *
 * Esta lista só pode crescer. `\b` nas pontas para não casar com substring de
 * outra palavra — e é o identificador do Prisma que interessa, porque é ele que
 * aparece numa consulta.
 */
const PROIBIDOS = [
  'weightLog',
  'weightKg',
  'meal',
  'mealItem',
  'food',
  // `\b` não casa dentro de `foodGroup`: `\bfood\b` para em "food" seguido de
  // "G", que é caractere de palavra. O modelo precisa estar na lista por escrito.
  'foodGroup',
  'nutrientTarget',
  'heightCm',
  'userGoals',
  // `Goal` é literalmente "meta corporal": `kind: GoalKind` tem `weight` e
  // `body_fat`, com `startValue`, `targetValue` e `lastReportedValue`. Estava
  // fora da lista, e a revisão provou que dava para consultar meta de percentual
  // de gordura dentro do módulo com este spec verde.
  'goal',
  'goals',
  'bodyFat',
  'waterLog',
  'stepLog',
  'avgHeartRate',
  'kcalBurned',
];

const PADRAO = new RegExp(`\\b(${PROIBIDOS.join('|')})\\b`, 'i');

function arquivosDeProducao(): string[] {
  return readdirSync(INSIGHTS_SRC, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.ts') && !entry.includes('__tests__'))
    .map((entry) => join(INSIGHTS_SRC, entry))
    .sort();
}

describe('insights/ não toca dado corporal nem alimentar', () => {
  const arquivos = arquivosDeProducao();

  it('encontra os arquivos de produção do módulo', () => {
    // Sanidade: com a varredura quebrada, o `it.each` abaixo rodaria zero casos
    // e o spec passaria provando nada.
    expect(arquivos.length).toBeGreaterThan(8);
    expect(arquivos.some((f) => f.endsWith('engagement.service.ts'))).toBe(true);
    expect(arquivos.some((f) => f.endsWith('behavior.service.ts'))).toBe(true);
  });

  it('o detector realmente detecta', () => {
    // O outro jeito de este spec ser inútil: um regex que não casa com nada.
    expect(PADRAO.test('this.prisma.weightLog.findMany({})')).toBe(true);
    expect(PADRAO.test('await this.prisma.meal.groupBy({})')).toBe(true);
    // E não casa com o que é legítimo no módulo.
    expect(PADRAO.test('muscleGroup')).toBe(false);
    expect(PADRAO.test('workoutSession')).toBe(false);
  });

  it.each([
    // As duas consultas que a revisão escreveu no módulo com este spec verde.
    ["this.prisma.goal.findMany({ where: { kind: 'body_fat' } })", 'goal'],
    ['this.prisma.foodGroup.findMany({ select: { id: true } })', 'foodGroup'],
    // E as vizinhas óbvias da mesma família.
    ['select: { targetValue: true, bodyFat: true }', 'bodyFat'],
    ['select: { weightKg: true }', 'weightKg'],
  ])('o detector pega %s', (linha) => {
    // Cada uma destas passava. `\b(food)\b` não casa com `foodGroup`, e `goal`
    // simplesmente não estava na lista — a promessa "nunca meta corporal" da
    // política §6 e do vetor 9 do THREAT_MODEL dependia de ninguém tentar.
    expect(PADRAO.test(linha)).toBe(true);
  });

  it('não reprova o que é legítimo e parece', () => {
    // Lista que só cresce também erra crescendo demais: um falso positivo aqui
    // vira "remova o identificador certo" e o spec é desligado.
    expect(PADRAO.test('const objetivo = plan.goalless;')).toBe(false);
    expect(PADRAO.test('foodie')).toBe(false);
  });

  it.each(arquivos)('%s', (arquivo) => {
    const linhas = readFileSync(arquivo, 'utf8').split('\n');

    const achados = linhas
      .map((linha, i) => ({ linha, numero: i + 1 }))
      .filter(({ linha }) => PADRAO.test(linha))
      .map(({ linha, numero }) => `${arquivo}:${numero} ${linha.trim()}`);

    expect(achados).toEqual([]);
  });

  it('nenhum recorte escapa pelo SQL cru', () => {
    // `$queryRaw` é a porta de saída óbvia: um recorte "só para este relatório"
    // que monta o SQL à mão não passa por `CUTS`, não passa por `suppress()`, e
    // nenhum dos outros testes deste módulo o veria.
    const comRaw = arquivos.filter((arquivo) =>
      /\$queryRaw|\$executeRaw|Prisma\.sql/.test(readFileSync(arquivo, 'utf8')),
    );

    expect(comRaw).toEqual([]);
  });
});
