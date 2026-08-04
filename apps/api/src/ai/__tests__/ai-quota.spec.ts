import {
  AiQuotaExceededException,
  assertAiQuota,
  decideAiQuota,
  utcQuotaWindow,
  type AiQuotaLimits,
  type AiQuotaSpend,
} from '../ai-quota';

/**
 * Cota de IA hospedada (issue #135).
 *
 * Com preço fixo por cabeça (#158), a cota é a única defesa de margem: não há mais diferenciação de
 * cobrança para absorver um aluno deficitário. E ela precisa **degradar sem quebrar** — o registro
 * manual continua sendo o caminho.
 */

const LIMITES: AiQuotaLimits = {
  userDailyMicros: 100_000,
  globalDailyMicros: 1_000_000,
  unpricedDailyCalls: 20,
};

/** Gasto medido por inteiro — o caso normal, em que toda chamada teve preço conhecido. */
function gasto(spend: Omit<AiQuotaSpend, 'unpricedCalls'> & { unpricedCalls?: number }) {
  return { unpricedCalls: 0, ...spend };
}

// 23:30 UTC de propósito: no fuso de São Paulo (UTC-3) ainda é 20:30 do mesmo dia, então um cálculo
// que usasse o fuso local do processo cairia em outra janela e o `resetsAt` sairia errado.
const AGORA = new Date('2026-08-03T23:30:00.000Z');

describe('utcQuotaWindow', () => {
  it('abre a janela na meia-noite UTC e fecha na seguinte', () => {
    expect(utcQuotaWindow(AGORA)).toEqual({
      start: new Date('2026-08-03T00:00:00.000Z'),
      resetsAt: new Date('2026-08-04T00:00:00.000Z'),
    });
  });

  it('não usa o fuso local do processo', () => {
    // Instante em que a data UTC e a data local de São Paulo divergem. Se `utcQuotaWindow` usasse
    // `getFullYear()` em vez de `getUTCFullYear()`, a janela abriria no dia 2.
    const virada = new Date('2026-08-03T02:00:00.000Z');
    expect(utcQuotaWindow(virada).start).toEqual(new Date('2026-08-03T00:00:00.000Z'));
  });
});

describe('decideAiQuota', () => {
  it('libera quem está abaixo do teto', () => {
    expect(decideAiQuota(gasto({ userMicros: 99_999, globalMicros: 0 }), LIMITES, AGORA)).toEqual({
      allowed: true,
    });
  });

  it('barra quem está EXATAMENTE no teto', () => {
    // `spent` é o gasto de antes desta chamada: quem está no limite não tem orçamento para a
    // próxima. Com `>` no lugar de `>=`, o teto seria sempre ultrapassado por uma chamada — e uma
    // chamada de visão não é barata.
    const decisao = decideAiQuota(gasto({ userMicros: 100_000, globalMicros: 0 }), LIMITES, AGORA);
    expect(decisao.allowed).toBe(false);
  });

  it('barra e diz o escopo, o gasto, o teto e quando volta', () => {
    expect(decideAiQuota(gasto({ userMicros: 150_000, globalMicros: 0 }), LIMITES, AGORA)).toEqual({
      allowed: false,
      scope: 'user',
      spentMicros: 150_000,
      limitMicros: 100_000,
      resetsAt: new Date('2026-08-04T00:00:00.000Z'),
    });
  });

  it('o teto global barra um usuário que não gastou quase nada', () => {
    // Cota por usuário não protege contra mil usuários novos no mesmo dia. Sem este caso, o teto
    // global poderia estar desligado por engano e nada acusaria.
    expect(
      decideAiQuota(gasto({ userMicros: 10, globalMicros: 1_000_000 }), LIMITES, AGORA),
    ).toMatchObject({ allowed: false, scope: 'global' });
  });

  it('quando os dois estouram, reporta o global', () => {
    // É o que o usuário não resolve sozinho — mandá-lo esperar a própria cota seria mentira.
    expect(
      decideAiQuota(gasto({ userMicros: 999_999, globalMicros: 9_999_999 }), LIMITES, AGORA),
    ).toMatchObject({ scope: 'global' });
  });

  it.each([
    [
      'teto por usuário em 0 desliga só o teto por usuário',
      { userDailyMicros: 0, globalDailyMicros: 1_000, unpricedDailyCalls: 20 },
      gasto({ userMicros: 10_000_000, globalMicros: 0 }),
      true,
    ],
    [
      'teto global em 0 desliga só o teto global',
      { userDailyMicros: 1_000, globalDailyMicros: 0, unpricedDailyCalls: 20 },
      gasto({ userMicros: 0, globalMicros: 10_000_000 }),
      true,
    ],
    [
      'ambos em 0 desligam a cota inteira',
      { userDailyMicros: 0, globalDailyMicros: 0, unpricedDailyCalls: 20 },
      gasto({ userMicros: 9e9, globalMicros: 9e9 }),
      true,
    ],
  ])('%s', (_caso, limites, spend, esperado) => {
    // Instância auto-hospedada com modelo local não tem custo a conter; `0` é a forma de dizer
    // isso. Se `0` fosse lido como "teto zero", toda instância local nasceria com a IA barrada.
    expect(decideAiQuota(spend, limites, AGORA).allowed).toBe(esperado);
  });

  it('usuário sem nenhum registro passa', () => {
    expect(decideAiQuota(gasto({ userMicros: 0, globalMicros: 0 }), LIMITES, AGORA).allowed).toBe(
      true,
    );
  });
});

/**
 * O sinal do `pricingKnown` chegando a quem decide (issue #135).
 *
 * O modo de falha aqui não é um teto errado: é a **cota se desligando sozinha**. Custo desconhecido
 * entra na soma como `0` — é a única saída honesta, já que a alternativa seria inventar um número —
 * e uma soma que fica em `0` devolve `allowed: true` para sempre. A contenção some exatamente no
 * momento em que a medição sumiu, e a única notificação é a fatura.
 */
describe('decideAiQuota — chamadas sem preço', () => {
  it('a cota não é liberada por uma soma que ficou em zero porque ninguém sabia o preço', () => {
    // O cenário literal: trocaram `AI_MODEL_VISION` no painel e esqueceram a `AI_PRICE_TABLE`.
    // Toda chamada do dia estimou `costMicros: 0`, então `userMicros` e `globalMicros` são `0` e
    // os dois tetos de dinheiro liberariam — para sempre.
    const decisao = decideAiQuota(
      { userMicros: 0, globalMicros: 0, unpricedCalls: 20 },
      LIMITES,
      AGORA,
    );

    expect(decisao).toEqual({
      allowed: false,
      scope: 'unpriced',
      unpricedCalls: 20,
      limitCalls: 20,
      resetsAt: new Date('2026-08-04T00:00:00.000Z'),
    });
  });

  it('tolera até o teto, e barra EXATAMENTE nele', () => {
    // Uma chamada a menos que o teto ainda passa: a tolerância existe para o alerta de anomalia
    // aparecer antes de a IA apagar, não para deixar o buraco aberto.
    expect(
      decideAiQuota({ userMicros: 0, globalMicros: 0, unpricedCalls: 19 }, LIMITES, AGORA).allowed,
    ).toBe(true);
    expect(
      decideAiQuota({ userMicros: 0, globalMicros: 0, unpricedCalls: 20 }, LIMITES, AGORA).allowed,
    ).toBe(false);
  });

  it('a medição perdida é reportada antes dos tetos de dinheiro, quando os dois estouram', () => {
    // Os tetos de dinheiro comparam contra uma soma que sabidamente não conta essas chamadas.
    // Reportar 'global' aqui mandaria quem opera esperar a meia-noite por um problema que a
    // meia-noite não resolve.
    expect(
      decideAiQuota({ userMicros: 9e9, globalMicros: 9e9, unpricedCalls: 99 }, LIMITES, AGORA),
    ).toMatchObject({ scope: 'unpriced' });
  });

  it('sem nenhum teto de dinheiro ligado, chamada sem preço não barra nada', () => {
    // Instância auto-hospedada com modelo local roda com a `AI_PRICE_TABLE` vazia de propósito:
    // *toda* chamada dela é "sem preço". Sem esta cláusula, quem desligou a cota nasceria com a
    // IA barrada — e pela guarda de uma cota que não existe.
    expect(
      decideAiQuota(
        { userMicros: 9e9, globalMicros: 9e9, unpricedCalls: 9_999 },
        { userDailyMicros: 0, globalDailyMicros: 0, unpricedDailyCalls: 20 },
        AGORA,
      ).allowed,
    ).toBe(true);
  });

  it('teto de tolerância em 0 barra na PRIMEIRA chamada sem preço, e não antes dela', () => {
    // `0` aqui não desliga a guarda, ao contrário dos dois tetos de dinheiro — significa "nenhuma
    // tolerância". Sem a cláusula `unpricedCalls > 0`, o `>=` fecharia a IA de uma instância cuja
    // medição está perfeita, que é o oposto do que a guarda quer.
    const semTolerancia = { ...LIMITES, unpricedDailyCalls: 0 };
    expect(
      decideAiQuota({ userMicros: 0, globalMicros: 0, unpricedCalls: 0 }, semTolerancia, AGORA)
        .allowed,
    ).toBe(true);
    expect(
      decideAiQuota({ userMicros: 0, globalMicros: 0, unpricedCalls: 1 }, semTolerancia, AGORA)
        .allowed,
    ).toBe(false);
  });

  it('o 429 não conta ao usuário um problema que é de quem opera', () => {
    // Para o aluno o efeito é o do teto global; a diferença fica no `scope`, que quem opera lê.
    // Explicar "a tabela de preço está desatualizada" seria vazar infraestrutura em troca de
    // nenhuma ação possível do lado dele.
    let corpo: Record<string, unknown> = {};
    try {
      assertAiQuota({ userMicros: 0, globalMicros: 0, unpricedCalls: 50 }, LIMITES, AGORA);
    } catch (err) {
      corpo = (err as AiQuotaExceededException).getResponse() as Record<string, unknown>;
    }

    expect(corpo).toMatchObject({ code: 'AI_QUOTA_EXCEEDED', scope: 'unpriced' });
    expect(String(corpo.message)).toMatch(/manual/i);
    expect(String(corpo.message)).toContain('2026-08-04T00:00:00.000Z');
    expect(String(corpo.message)).not.toMatch(/preço|tabela|AI_PRICE_TABLE|modelo/i);
  });
});

describe('assertAiQuota', () => {
  it('não lança quando há orçamento', () => {
    expect(() =>
      assertAiQuota(gasto({ userMicros: 0, globalMicros: 0 }), LIMITES, AGORA),
    ).not.toThrow();
  });

  it('lança 429 com código nomeado', () => {
    let erro: unknown;
    try {
      assertAiQuota(gasto({ userMicros: 999_999, globalMicros: 0 }), LIMITES, AGORA);
    } catch (err) {
      erro = err;
    }

    expect(erro).toBeInstanceOf(AiQuotaExceededException);
    const excecao = erro as AiQuotaExceededException;
    expect(excecao.getStatus()).toBe(429);
    expect(excecao.getResponse()).toMatchObject({
      code: 'AI_QUOTA_EXCEEDED',
      scope: 'user',
      resetsAt: '2026-08-04T00:00:00.000Z',
    });
  });

  it.each([
    ['por usuário', gasto({ userMicros: 999_999, globalMicros: 0 })],
    ['global', gasto({ userMicros: 0, globalMicros: 9_999_999 })],
  ])('a mensagem %s diz que o registro manual continua e quando a IA volta', (_caso, gasto) => {
    // O risco nomeado na issue: se a mensagem for genérica, o que chega ao suporte é "o app parou
    // de reconhecer foto" — e a pessoa procura o problema na câmera dela.
    let mensagem = '';
    try {
      assertAiQuota(gasto, LIMITES, AGORA);
    } catch (err) {
      mensagem = ((err as AiQuotaExceededException).getResponse() as { message: string }).message;
    }

    expect(mensagem).toMatch(/manual/i);
    expect(mensagem).toContain('2026-08-04T00:00:00.000Z');
  });

  it('não oferece pagamento em lugar nenhum da resposta', () => {
    // O app é grátis para o aluno (#158). A cota degrada; ela não vende. Um guarda textual porque o
    // modo de falha aqui é alguém "melhorar" a mensagem depois, e nada mais acusaria.
    let corpo = '';
    try {
      assertAiQuota(gasto({ userMicros: 999_999, globalMicros: 0 }), LIMITES, AGORA);
    } catch (err) {
      corpo = JSON.stringify((err as AiQuotaExceededException).getResponse());
    }

    expect(corpo).not.toMatch(/assinatura|upgrade|plano|pagar|pagamento|premium/i);
  });
});
