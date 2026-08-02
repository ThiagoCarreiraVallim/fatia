import { addDaysIso } from '../helpers/date-tz';
import {
  JANELA_DIAS,
  TOLERANCIA_DIARIA,
  TOLERANCIA_SEMANAL,
  computeStreak,
} from '../helpers/compute-streak';

/**
 * O coração da issue #147: a sequência tolera falha.
 *
 * A versão anterior fazia `break` no primeiro dia sem registro — o comportamento que a issue
 * proíbe, implementado ao contrário. Estes casos são a regra escrita como consequência, e não
 * como paráfrase do código: cada um diz o que o usuário vê.
 *
 * `addDaysIso` é o helper **real**. Reimplementar aritmética de data no teste é a maneira mais
 * fácil de escrever um teste que concorda consigo mesmo e não com o produto.
 */

const HOJE = '2026-01-15';

function diario(ativos: string[], corrente = HOJE) {
  return computeStreak({
    ativos: new Set(ativos),
    corrente,
    anterior: (d) => addDaysIso(d, -1),
    janela: JANELA_DIAS,
    tolerancia: TOLERANCIA_DIARIA,
  });
}

/** Dias corridos terminando em `corrente`, do mais recente para o mais antigo. */
function ultimosDias(quantidade: number, corrente = HOJE): string[] {
  return Array.from({ length: quantidade }, (_, i) => addDaysIso(corrente, -i));
}

describe('computeStreak', () => {
  it('conta dias contíguos', () => {
    const r = diario(ultimosDias(5));

    expect(r.periodos).toBe(5);
    expect(r.faltasUsadas).toBe(0);
  });

  it('um dia perdido no meio NÃO quebra a sequência', () => {
    // O critério de pronto nº 1 da issue, literal: refeições em D-0, D-2 e D-3 valem 4 dias, não
    // 1. Sob o `break` antigo isto dava 1 — meses de trabalho zerados por um dia.
    const r = diario([HOJE, addDaysIso(HOJE, -2), addDaysIso(HOJE, -3)]);

    expect(r.periodos).toBe(4);
    expect(r.faltasUsadas).toBe(1);
    expect(r.faltasPermitidas).toBeGreaterThanOrEqual(1);
  });

  it('dois dias consecutivos perdidos quebram', () => {
    // "Escorreguei" é uma falta; "parei" são duas seguidas. É a única fronteira que separa
    // tolerância de sequência que nunca acaba.
    const r = diario([HOJE, addDaysIso(HOJE, -3), addDaysIso(HOJE, -4), addDaysIso(HOJE, -5)]);

    expect(r.periodos).toBe(1);
    expect(r.faltasUsadas).toBe(0);
  });

  it('quebra quando o orçamento acaba, mesmo sem duas faltas seguidas', () => {
    // Faltas isoladas em D-1, D-9 e D-11, com sete dias ativos no meio para o orçamento chegar
    // ao teto de 2. A terceira falta não tem com o que ser paga e a sequência para ali — sem ela,
    // faltar dia sim dia não valeria uma sequência infinita.
    const ativos = [0, 2, 3, 4, 5, 6, 7, 8, 10].map((n) => addDaysIso(HOJE, -n));

    const r = diario(ativos);

    expect(r.periodos).toBe(11);
    expect(r.faltasUsadas).toBe(2);
    expect(r.faltasPermitidas).toBe(2);
  });

  it('faltar dia sim, dia não não vale sequência longa', () => {
    // O outro lado da tolerância. Sem o orçamento, alternar registro e ausência manteria a
    // sequência viva para sempre e o número deixaria de significar consistência.
    const ativos = [0, 2, 4, 6, 8, 10, 12, 14].map((n) => addDaysIso(HOJE, -n));

    expect(diario(ativos).periodos).toBeLessThan(7);
  });

  it('o orçamento acumula uma falta a cada 7 dias e satura em 2', () => {
    const curto = diario(ultimosDias(3));
    const medio = diario(ultimosDias(10));
    const longo = diario(ultimosDias(90));

    expect(curto.faltasPermitidas).toBe(1);
    expect(medio.faltasPermitidas).toBe(2);
    expect(longo.faltasPermitidas).toBe(2);
  });

  it('sequência de zero dias devolve 0, não NaN', () => {
    const r = diario([]);

    expect(r.periodos).toBe(0);
    expect(r.faltasUsadas).toBe(0);
    expect(Number.isNaN(r.periodos)).toBe(false);
  });

  it('o dia corrente ainda sem registro não é falta — o dia não acabou', () => {
    // Sem isto o streak de quem ainda não almoçou apareceria quebrado toda manhã, que é
    // exatamente o empurrão para "registrar qualquer coisa" que a issue quer evitar.
    const r = diario(ultimosDias(4, addDaysIso(HOJE, -1)));

    expect(r.periodos).toBe(4);
    expect(r.periodoCorrenteEmAberto).toBe(true);
    expect(r.faltasUsadas).toBe(0);
  });

  it('o dia corrente em aberto não some do orçamento de faltas', () => {
    // Hoje sem registro E ontem sem registro: ontem é a primeira falta, e ela é tolerada.
    const r = diario([addDaysIso(HOJE, -2), addDaysIso(HOJE, -3)]);

    expect(r.periodos).toBe(2);
    expect(r.faltasUsadas).toBe(0);
    expect(r.periodoCorrenteEmAberto).toBe(true);
  });

  it('a virada de ano é contígua', () => {
    // 30/12 → 31/12 → 01/01. Aritmética de data feita com strings erra aqui com facilidade.
    const r = diario(['2026-01-01', '2025-12-31', '2025-12-30'], '2026-01-01');

    expect(r.periodos).toBe(3);
  });

  it('avisa quando encosta no teto da janela em vez de mentir o número', () => {
    // O teto existe porque a consulta precisa de um começo. Sem este sinal, quem passa de um ano
    // fica travado no mesmo número para sempre e não tem como saber.
    const r = diario(ultimosDias(JANELA_DIAS));

    expect(r.periodos).toBe(JANELA_DIAS);
    expect(r.janelaEsgotada).toBe(true);
  });

  it('não marca janela esgotada quando a sequência cabe folgada', () => {
    expect(diario(ultimosDias(30)).janelaEsgotada).toBe(false);
  });

  it('faltasUsadas nunca passa de faltasPermitidas', () => {
    // Invariante: o card mostra "1 de 2 faltas usadas". Passar disso seria um número impossível
    // na tela, e é o tipo de coisa que só aparece numa combinação específica de faltas.
    for (let semente = 0; semente < 40; semente++) {
      const ativos = ultimosDias(60).filter((_, i) => (i * 7 + semente) % 5 !== 0);
      const r = diario(ativos);
      expect(r.faltasUsadas).toBeLessThanOrEqual(r.faltasPermitidas);
    }
  });

  it('usa a mesma regra para semanas, andando de 7 em 7', () => {
    const segunda = '2026-01-12';
    const semanas = [0, 1, 3].map((n) => addDaysIso(segunda, -7 * n));

    const r = computeStreak({
      ativos: new Set(semanas),
      corrente: segunda,
      anterior: (s) => addDaysIso(s, -7),
      janela: 53,
      tolerancia: TOLERANCIA_SEMANAL,
    });

    expect(r.periodos).toBe(4);
    expect(r.faltasUsadas).toBe(1);
  });
});
