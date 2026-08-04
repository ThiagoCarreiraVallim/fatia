import {
  JANELA_DE_ATIVIDADE_DIAS,
  diasAtivos,
  janelaDeAtividade,
  periodoDeCobranca,
  proRataMilli,
  valorDaLinhaCents,
} from '../cycle';

const SP = 'America/Sao_Paulo';

describe('periodoDeCobranca', () => {
  it('fecha o ciclo à meia-noite do fuso do grupo, não em UTC', () => {
    // 03/08/2026, 12h UTC. Ciclo fecha todo dia 1.
    const periodo = periodoDeCobranca(1, SP, new Date('2026-08-03T12:00:00Z'));

    // São Paulo é UTC-3: a meia-noite local de 01/07 é 03:00 UTC.
    expect(periodo.start.toISOString()).toBe('2026-07-01T03:00:00.000Z');
    expect(periodo.end.toISOString()).toBe('2026-08-01T03:00:00.000Z');
    expect(periodo.startYmd).toBe('2026-07-01');
    expect(periodo.endYmd).toBe('2026-08-01');
    expect(periodo.dias).toHaveLength(31);
  });

  it('devolve o ciclo que já fechou, nunca o que ainda corre', () => {
    // Dia 20, ciclo fecha no dia 1: o último fechamento foi 01/08.
    const periodo = periodoDeCobranca(1, SP, new Date('2026-08-20T12:00:00Z'));
    expect(periodo.startYmd).toBe('2026-07-01');
    expect(periodo.endYmd).toBe('2026-08-01');

    // Dia 3 com ciclo fechando no dia 10: o fechamento foi em julho.
    const antes = periodoDeCobranca(10, SP, new Date('2026-08-03T12:00:00Z'));
    expect(antes.startYmd).toBe('2026-06-10');
    expect(antes.endYmd).toBe('2026-07-10');
  });

  it('conta 28 dias em fevereiro e 31 em julho, sem pular mês', () => {
    expect(periodoDeCobranca(1, SP, new Date('2026-03-02T12:00:00Z')).dias).toHaveLength(28);
    expect(periodoDeCobranca(1, SP, new Date('2026-05-02T12:00:00Z')).dias).toHaveLength(30);
    expect(periodoDeCobranca(1, SP, new Date('2026-08-02T12:00:00Z')).dias).toHaveLength(31);
  });

  it('aceita fechamento no dia 28 em todos os meses, inclusive fevereiro', () => {
    const fevereiro = periodoDeCobranca(28, SP, new Date('2026-03-01T12:00:00Z'));
    expect(fevereiro.startYmd).toBe('2026-01-28');
    expect(fevereiro.endYmd).toBe('2026-02-28');

    // Doze fechamentos seguidos, um por mês: nenhum salto, nenhum repetido.
    const fechamentos = Array.from(
      { length: 12 },
      (_, i) => periodoDeCobranca(28, SP, new Date(Date.UTC(2026, i, 28, 15))).endYmd,
    );
    expect(new Set(fechamentos).size).toBe(12);
  });

  it('recusa dia de fechamento que não existe em todo mês', () => {
    for (const dia of [29, 30, 31, 0, -1, 1.5]) {
      expect(() => periodoDeCobranca(dia, SP, new Date())).toThrow(RangeError);
    }
  });

  it('vira o ano sem perder o mês de dezembro', () => {
    const periodo = periodoDeCobranca(1, SP, new Date('2027-01-05T12:00:00Z'));
    expect(periodo.startYmd).toBe('2026-12-01');
    expect(periodo.endYmd).toBe('2027-01-01');
    expect(periodo.dias).toHaveLength(31);
  });

  it('encadeia os dias sem buraco: o fim de um é o começo do seguinte', () => {
    // O invariante é sobre a construção, e é o que impede `start + 24 h` de
    // voltar: num fuso com horário de verão existe dia de 23 h, e somar 24 h
    // deixaria uma hora sem dono bem na virada.
    for (const fuso of [SP, 'America/New_York', 'Australia/Lord_Howe']) {
      const periodo = periodoDeCobranca(1, fuso, new Date('2026-04-05T12:00:00Z'));
      expect(periodo.dias[0].start.getTime()).toBe(periodo.start.getTime());
      expect(periodo.dias[periodo.dias.length - 1].end.getTime()).toBe(periodo.end.getTime());

      for (let i = 0; i < periodo.dias.length - 1; i++) {
        expect(periodo.dias[i].end.getTime()).toBe(periodo.dias[i + 1].start.getTime());
        expect(periodo.dias[i].end.getTime()).toBeGreaterThan(periodo.dias[i].start.getTime());
      }
    }
  });
});

describe('janelaDeAtividade', () => {
  it('inclui quem registrou às 23h59 do último dia local do ciclo', () => {
    const periodo = periodoDeCobranca(1, SP, new Date('2026-08-03T12:00:00Z'));
    const janela = janelaDeAtividade(periodo);

    // 31/07 às 23h59 em São Paulo = 01/08 às 02h59 UTC. Uma janela fechada em
    // UTC terminaria às 00:00Z e jogaria esta atividade — que existiu — para
    // fora da contagem. O erro cai sempre para o mesmo lado: o aluno "some".
    const registrouTarde = new Date('2026-08-01T02:59:00Z');
    expect(registrouTarde.getTime()).toBeLessThan(janela.end.getTime());
    expect(registrouTarde.getTime()).toBeGreaterThanOrEqual(janela.start.getTime());
  });

  it('olha os 30 dias que terminam no fechamento, e não o ciclo inteiro', () => {
    const periodo = periodoDeCobranca(1, SP, new Date('2026-08-03T12:00:00Z'));
    const janela = janelaDeAtividade(periodo);

    expect(janela.end.getTime()).toBe(periodo.end.getTime());
    // Julho tem 31 dias; a janela de 30 começa em 02/07, um dia depois do ciclo.
    expect(janela.start.toISOString()).toBe('2026-07-02T03:00:00.000Z');
    expect(JANELA_DE_ATIVIDADE_DIAS).toBe(30);
  });
});

describe('pró-rata', () => {
  const periodo = periodoDeCobranca(1, SP, new Date('2026-08-03T12:00:00Z')); // julho, 31 dias

  it('cobra o ciclo inteiro de quem esteve o ciclo inteiro', () => {
    const membresia = { joinedAt: new Date('2026-05-10T12:00:00Z'), leftAt: null };
    expect(diasAtivos(periodo, membresia)).toBe(31);
    expect(proRataMilli(periodo, membresia)).toBe(1000);
  });

  it('cobra proporcional a quem entrou no meio do ciclo', () => {
    // Entrou em 11/07 às 10h de São Paulo: 21 dos 31 dias.
    const membresia = { joinedAt: new Date('2026-07-11T13:00:00Z'), leftAt: null };
    expect(diasAtivos(periodo, membresia)).toBe(21);
    expect(proRataMilli(periodo, membresia)).toBe(677);
  });

  it('cobra proporcional a quem saiu no meio do ciclo', () => {
    // Saiu em 11/07 às 10h: os dias 01 a 11 contam (esteve parte do dia 11).
    const membresia = {
      joinedAt: new Date('2026-01-01T12:00:00Z'),
      leftAt: new Date('2026-07-11T13:00:00Z'),
    };
    expect(diasAtivos(periodo, membresia)).toBe(11);
    expect(proRataMilli(periodo, membresia)).toBe(355);
  });

  it('cobra só a interseção de quem entrou e saiu no mesmo ciclo', () => {
    const membresia = {
      joinedAt: new Date('2026-07-11T13:00:00Z'),
      leftAt: new Date('2026-07-20T13:00:00Z'),
    };
    expect(diasAtivos(periodo, membresia)).toBe(10);
    expect(proRataMilli(periodo, membresia)).toBe(323);
  });

  it('não cobra quem entrou depois do fechamento nem quem saiu antes do início', () => {
    expect(
      proRataMilli(periodo, { joinedAt: new Date('2026-08-05T12:00:00Z'), leftAt: null }),
    ).toBe(0);
    expect(
      proRataMilli(periodo, {
        joinedAt: new Date('2026-01-01T12:00:00Z'),
        leftAt: new Date('2026-06-30T12:00:00Z'),
      }),
    ).toBe(0);
  });

  it('não cobra convite que nunca virou entrada', () => {
    expect(proRataMilli(periodo, { joinedAt: null, leftAt: null })).toBe(0);
  });

  it('converte milésimo em centavo inteiro', () => {
    expect(valorDaLinhaCents(1500, 1000)).toBe(1500);
    expect(valorDaLinhaCents(1500, 677)).toBe(1016);
    expect(valorDaLinhaCents(1500, 0)).toBe(0);
    // Todo valor é inteiro em toda etapa: a soma de N linhas nunca acumula
    // resíduo de ponto flutuante, por maior que seja N.
    expect(Number.isInteger(valorDaLinhaCents(2999, 323))).toBe(true);
  });
});
