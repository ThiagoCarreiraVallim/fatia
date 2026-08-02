import {
  parseRepRange,
  prescribeLoad,
  type PrescriptionSession,
  type PrescriptionSet,
} from '../helpers/prescribe-load';

const DAY = 24 * 60 * 60 * 1000;
const TODAY = new Date('2026-08-02T10:00:00.000Z');

const set = (weightKg: number, reps: number, rpe: number | null = null): PrescriptionSet => ({
  weightKg,
  reps,
  rpe,
});

/** `daysAgo` conta a partir da sessão mais recente, que é a base da prescrição. */
const session = (daysAgo: number, sets: PrescriptionSet[]): PrescriptionSession => ({
  startedAt: new Date(TODAY.getTime() - daysAgo * DAY),
  sets,
});

/** Duas sessões afastadas o bastante para o teto semanal não entrar em cena. */
const history = (sets: PrescriptionSet[]): PrescriptionSession[] => [
  session(0, sets),
  session(10, sets),
];

const prescribe = (
  sessions: PrescriptionSession[],
  overrides: {
    mechanic?: string | null;
    targetReps?: string | null;
    personalRecordKg?: number | null;
  } = {},
) =>
  prescribeLoad({
    sessions,
    // `in` e não `??`: `mechanic: null` é um caso do teste, não uma ausência.
    mechanic: 'mechanic' in overrides ? (overrides.mechanic ?? null) : 'compound',
    targetReps: 'targetReps' in overrides ? overrides.targetReps : '8-12',
    personalRecordKg: overrides.personalRecordKg ?? null,
  });

describe('prescribeLoad', () => {
  describe('dado insuficiente', () => {
    it('não sugere nada sem histórico nenhum', () => {
      expect(prescribe([])).toEqual({ status: 'insufficient_history' });
    });

    it('não sugere nada com uma única sessão', () => {
      // Uma sessão não distingue "carga fácil" de "primeira tentativa da vida".
      expect(prescribe([session(0, [set(60, 10, 7)])])).toEqual({
        status: 'insufficient_history',
      });
    });

    it('ignora sessão sem série de força válida ao contar o histórico', () => {
      expect(prescribe([session(0, [set(60, 10)]), session(7, [])])).toEqual({
        status: 'insufficient_history',
      });
    });
  });

  describe('autorregulação por RPE', () => {
    it('sobe a carga com RPE baixo e reps no topo da faixa', () => {
      const result = prescribe(history([set(60, 12, 7)]));
      expect(result).toMatchObject({
        status: 'ok',
        weightKg: 62.5,
        reps: 8,
        basis: 'rpe',
        action: 'increase_load',
        capped: false,
      });
    });

    it('mantém a carga e sobe uma repetição com RPE moderado', () => {
      expect(prescribe(history([set(60, 10, 8)]))).toMatchObject({
        weightKg: 60,
        reps: 11,
        basis: 'rpe',
        action: 'increase_reps',
      });
    });

    it('repete carga e repetições com RPE alto', () => {
      expect(prescribe(history([set(60, 10, 9)]))).toMatchObject({
        weightKg: 60,
        reps: 10,
        basis: 'rpe',
        action: 'hold',
      });
    });

    it('não sobe carga com reps no topo quando o RPE foi alto', () => {
      expect(prescribe(history([set(60, 12, 9.5)]))).toMatchObject({
        weightKg: 60,
        reps: 12,
        action: 'hold',
      });
    });

    it('usa a média do RPE da sessão, ignorando as séries sem RPE', () => {
      // 6 e 8 → média 7, ainda "fácil"; a série sem RPE não puxa a média para
      // baixo entrando como zero nem para cima entrando como 10.
      const sets = [set(60, 12, 6), set(60, 12, 8), set(60, 12, null)];
      expect(prescribe(history(sets))).toMatchObject({ basis: 'rpe', action: 'increase_load' });
    });
  });

  describe('dupla progressão sem RPE', () => {
    it('sobe a carga só quando todas as séries fecham o topo da faixa', () => {
      const sets = [set(60, 12), set(60, 12), set(60, 12)];
      expect(prescribe(history(sets))).toMatchObject({
        weightKg: 62.5,
        reps: 8,
        basis: 'reps',
        action: 'increase_load',
      });
    });

    it('não sobe a carga quando só a primeira série fechou o topo', () => {
      // A melhor série sozinha no topo costuma ser a primeira, ainda descansada.
      const sets = [set(60, 12), set(60, 9), set(60, 8)];
      expect(prescribe(history(sets))).toMatchObject({
        weightKg: 60,
        reps: 12,
        basis: 'reps',
        action: 'hold',
      });
    });

    it('sobe uma repetição dentro da faixa antes de pensar em carga', () => {
      expect(prescribe(history([set(60, 9), set(60, 9)]))).toMatchObject({
        weightKg: 60,
        reps: 10,
        basis: 'reps',
        action: 'increase_reps',
      });
    });

    it('marca basis "reps" mesmo quando a regra de RPE daria o mesmo número', () => {
      // O risco que este caso protege: sem RPE nenhum, a resposta é a mesma que
      // um RPE fácil daria — e a pessoa passaria a confiar num sinal que ela
      // nunca registrou.
      expect(prescribe(history([set(60, 12)]))).toMatchObject({
        action: 'increase_load',
        basis: 'reps',
      });
    });
  });

  describe('tetos de progressão', () => {
    it('corta o passo fixo pelos 5% da sessão quando a carga é baixa', () => {
      // 5% de 20 kg = 1 kg, menos que os 2,5 kg do composto; a anilha de 0,5
      // arredonda para baixo, nunca para cima.
      expect(prescribe(history([set(20, 12, 6)]))).toMatchObject({
        weightKg: 21,
        capped: true,
        action: 'increase_load',
      });
    });

    it('devolve a carga anterior quando a semana já subiu 10%', () => {
      const sessions = [
        session(0, [set(20, 12, 6)]),
        session(3, [set(19, 12, 6)]),
        session(6, [set(18, 12, 6)]),
      ];
      // 18 kg × 1,10 = 19,8 < 20: a semana inteira já rendeu mais de 10%.
      expect(prescribe(sessions)).toMatchObject({
        weightKg: 20,
        reps: 12,
        action: 'hold',
        capped: true,
      });
    });

    it('ainda conta a sessão de exatamente 7 dias atrás na semana', () => {
      // A fronteira do `<=`: os testes vizinhos usam 6 e 8 dias, e trocar o
      // comparador por `<` passaria despercebido — a sessão de 7 dias sairia da
      // janela e o teto semanal subiria de 19,8 para 22.
      const sessions = [session(0, [set(20, 12, 6)]), session(7, [set(18, 12, 6)])];
      expect(prescribe(sessions)).toMatchObject({ weightKg: 20, action: 'hold', capped: true });
    });

    it('deixa a semana de fora quando a sessão anterior está a mais de 7 dias', () => {
      const sessions = [
        session(0, [set(20, 12, 6)]),
        session(8, [set(15, 12, 6)]),
        session(12, [set(15, 12, 6)]),
      ];
      // Se a sessão de 8 dias atrás entrasse, o teto seria 15 × 1,10 = 16,5 e a
      // prescrição travaria em 20 kg. Fora da janela, sobra o teto da própria
      // última sessão e o salto de 5% acontece.
      expect(prescribe(sessions)).toMatchObject({ weightKg: 21, action: 'increase_load' });
    });

    it('não acrescenta carga acima de 1,05 × o recorde de todos os tempos', () => {
      // O recorde entra abaixo da carga base quando o histórico vem de um
      // exercício clonado: `getPersonalRecord` olha só o id pedido, e é
      // exatamente aí que este teto é o único que segura — os outros dois são
      // percentuais sobre um `weightKg` de unidade ambígua (halter × par).
      //
      // Sem ele a sugestão seria 102,5 kg. Note que a carga base é preservada:
      // o teto limita o acréscimo, nunca propõe menos do que já foi levantado.
      expect(prescribe(history([set(100, 12, 6)]), { personalRecordKg: 90 })).toMatchObject({
        weightKg: 100,
        capped: true,
      });
    });

    it('não deixa o teto virar acréscimo de carga com recorde folgado', () => {
      // Guarda do guarda: com recorde acima da base o teto absoluto não morde,
      // e o passo do composto passa inteiro.
      expect(prescribe(history([set(100, 12, 6)]), { personalRecordKg: 120 })).toMatchObject({
        weightKg: 102.5,
        capped: false,
      });
    });

    it('não repete as reps do piso da faixa quando o teto comeu o salto inteiro', () => {
      // Mesma carga com menos repetição é regressão travestida de progressão:
      // com o salto zerado, a prescrição volta a ser "repita o que você fez".
      expect(prescribe(history([set(100, 12, 6)]), { personalRecordKg: 90 })).toMatchObject({
        weightKg: 100,
        reps: 12,
        action: 'hold',
      });
    });
  });

  describe('carga leve e carga 0 (peso corporal)', () => {
    it('progride barra fixa, que é registrada com carga 0', () => {
      // Carga 0 é carga no app (o card grava `weightKg: 0` de propósito, com
      // `??` e não `||`). Com os tetos percentuais, 5% de 0 é 0, 1,05 × recorde
      // 0 é 0 e 10% da semana em 0 é 0: os três zeram o salto e quem faz 12
      // barras com RPE 6 recebe "repita 12" para sempre.
      const result = prescribe(history([set(0, 12, 6)]), { personalRecordKg: 0 });
      expect(result).toMatchObject({
        status: 'ok',
        weightKg: 0.5,
        reps: 8,
        action: 'increase_load',
      });
    });

    it('não trava a carga leve em que 5% valem menos que a menor anilha', () => {
      // 5% de 6 kg = 0,3 kg; o piso da anilha é 0,5 e o `floorToPlate` devolvia
      // os mesmos 6 kg. Sem o piso, toda carga abaixo de 10 kg fica parada para
      // sempre, por mais fácil que o RPE diga que ela está.
      expect(prescribe(history([set(6, 12, 6)]), { mechanic: 'isolation' })).toMatchObject({
        weightKg: 6.5,
        reps: 8,
        action: 'increase_load',
      });
    });

    it('mantém os 5% como teto assim que eles passam de uma anilha', () => {
      // Guarda do piso: em 20 kg os 5% valem 1 kg e continuam mandando, senão o
      // piso viraria licença para o passo inteiro de 2,5 kg.
      expect(prescribe(history([set(20, 12, 6)]))).toMatchObject({ weightKg: 21 });
    });
  });

  describe('passo por mecânica', () => {
    it('usa 2,5 kg em exercício composto', () => {
      expect(prescribe(history([set(100, 12, 6)]), { mechanic: 'compound' })).toMatchObject({
        weightKg: 102.5,
      });
    });

    it('usa 1,25 kg em exercício de isolamento', () => {
      expect(prescribe(history([set(100, 12, 6)]), { mechanic: 'isolation' })).toMatchObject({
        weightKg: 101,
      });
    });

    it('usa o passo menor quando a mecânica é desconhecida', () => {
      expect(prescribe(history([set(100, 12, 6)]), { mechanic: null })).toMatchObject({
        weightKg: 101,
      });
    });
  });

  describe('série de referência da sessão', () => {
    it('parte da série de maior 1RM estimado, não da mais pesada', () => {
      // 100 × 3 estima 110; 90 × 10 estima 120. A segunda é a série de trabalho.
      const sets = [set(100, 3, 8), set(90, 10, 8)];
      expect(prescribe(history(sets))).toMatchObject({ weightKg: 90, reps: 11 });
    });

    it('desempata pela carga maior quando o 1RM estimado é o mesmo', () => {
      // 90 × 10 e 100 × 6 estimam os mesmos 120 kg. Sem o desempate, o `reduce`
      // fica com a primeira série da lista e a sugestão trocaria 6 repetições
      // pesadas por 10 leves — que é o que o comentário da regra promete evitar.
      const sets = [set(90, 10, 8), set(100, 6, 8)];
      expect(prescribe(history(sets))).toMatchObject({ weightKg: 100, reps: 7 });
    });
  });

  describe('faixa alvo inválida', () => {
    it('nunca prescreve zero repetições', () => {
      // `GET /workout/exercises/1/prescription?targetReps=0` chega até aqui como
      // string crua; o número prescrito vai direto para o campo do card.
      expect(prescribe(history([set(60, 10, 6)]), { targetReps: '0' })).toMatchObject({
        weightKg: 62.5,
        reps: 1,
      });
    });
  });

  describe('repetições abaixo do piso da faixa', () => {
    it('sobe uma repetição por vez até entrar na faixa, sem pular para o piso', () => {
      // Decisão, não descuido: 60 × 3 com RPE 7 quer dizer ~3 repetições em
      // reserva, ou seja ~6 naquela carga — prescrever as 8 do piso da faixa
      // pediria uma série que a última sessão não sustenta, que é o salto sem
      // lastro que esta issue existe para não dar. A carga fica e as reps
      // sobem; quem quer entrar na faixa de uma vez muda a carga.
      expect(prescribe(history([set(60, 3, 7)]))).toMatchObject({
        weightKg: 60,
        reps: 4,
        action: 'increase_reps',
      });
    });
  });

  describe('descanso', () => {
    it('dá 180s para composto pesado', () => {
      expect(prescribe(history([set(100, 5, 8)]), { targetReps: '5' })).toMatchObject({
        restSeconds: 180,
      });
    });

    it('ainda dá 180s com exatamente 6 repetições', () => {
      // A fronteira do `reps <= 6`: o caso de 180s acima usa 5 reps e o de 90s
      // usa 10, então trocar o limite por 5 passaria batido.
      expect(prescribe(history([set(60, 5, 8)]), { targetReps: '6' })).toMatchObject({
        reps: 6,
        restSeconds: 180,
      });
    });

    it('dá 90s para composto na faixa de hipertrofia', () => {
      expect(prescribe(history([set(60, 10, 8)]))).toMatchObject({ restSeconds: 90 });
    });

    it('dá 60s para isolamento', () => {
      expect(prescribe(history([set(20, 10, 8)]), { mechanic: 'isolation' })).toMatchObject({
        restSeconds: 60,
      });
    });

    it('dá 60s acima de 12 repetições', () => {
      expect(prescribe(history([set(30, 18, 8)]), { targetReps: '15-20' })).toMatchObject({
        restSeconds: 60,
      });
    });
  });

  describe('arredondamento', () => {
    it('sempre devolve múltiplo de 0,5 kg', () => {
      // 5% de 31 kg = 1,55; 31 + 1,55 = 32,55 → 32,5 e não 32,55.
      expect(prescribe(history([set(31, 12, 6)]))).toMatchObject({ weightKg: 32.5 });
    });
  });
});

describe('parseRepRange', () => {
  it('lê faixa "min-max"', () => {
    expect(parseRepRange('8-12')).toEqual({ min: 8, max: 12 });
  });

  it('lê número único como faixa fechada', () => {
    expect(parseRepRange('5')).toEqual({ min: 5, max: 5 });
  });

  it('nunca devolve faixa que começa em zero', () => {
    // `targetReps` vem da query string sem DTO: `?targetReps=0` prescrevia
    // `reps: 0`, e o card copia esse número para o campo de repetições.
    expect(parseRepRange('0')).toEqual({ min: 1, max: 1 });
    expect(parseRepRange('0-12')).toEqual({ min: 1, max: 12 });
  });

  it('cai na faixa padrão em alvo sem número', () => {
    expect(parseRepRange('AMRAP')).toEqual({ min: 8, max: 12 });
    expect(parseRepRange(null)).toEqual({ min: 8, max: 12 });
    expect(parseRepRange(undefined)).toEqual({ min: 8, max: 12 });
  });
});
