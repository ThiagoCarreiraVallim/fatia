import { ListGoalsTool } from '../../goals/mcp/list-goals.tool';
import { GetStepsHistoryTool } from '../../progress/mcp/get-steps-history.tool';
import { GetStreakTool } from '../../progress/mcp/get-streak.tool';
import { GetWaterHistoryTool } from '../../progress/mcp/get-water-history.tool';
import { ListAchievementsTool } from '../../progress/mcp/list-achievements.tool';
import { ExportMyDataTool } from '../../users/mcp/export-my-data.tool';
import { ExplainFormTool } from '../../workout/mcp/explain-form.tool';
import { genericList } from '../generic-card';

/**
 * Os cartões da prancha IA-Cartoes (#384) que nascem do resultado de cada tool.
 *
 * O campo que identifica cada formato é o mesmo de `apps/agent/.../artefatos.py`
 * (`CAMPO_OBRIGATORIO`): um artefato sem ele é descartado lá, em silêncio.
 */

const semServico = null as never;

describe('cartões das tools no chat (#384)', () => {
  it('passos: barras por dia, com a meta batida marcada', () => {
    const card = new GetStepsHistoryTool(semServico).artifact(
      {
        days: [
          { date: '2026-11-15', steps: 4000, goalReached: false },
          { date: '2026-11-16', steps: 9000, goalReached: true },
        ],
        averageDaily: 6500,
        daysWithGoalReached: 1,
        totalDaysLogged: 2,
      },
      { days: 2 },
    );
    expect(card).toEqual({
      kind: 'bars',
      label: 'Passos nos últimos 2 dias',
      unit: 'passos',
      average: 6500,
      bars: [
        { label: '2026-11-15', value: 4000, reached: false },
        { label: '2026-11-16', value: 9000, reached: true },
      ],
    });
  });

  it('água: barras em ml', () => {
    const card = new GetWaterHistoryTool(semServico).artifact(
      [{ date: '2026-11-16', totalMl: 1500 }],
      { days: 1 },
    );
    expect(card).toEqual({
      kind: 'bars',
      label: 'Água nos últimos 1 dias',
      unit: 'ml',
      bars: [{ label: '2026-11-16', value: 1500 }],
    });
  });

  it('metas: progresso em porcentagem, com o atual e o alvo', () => {
    const card = new ListGoalsTool(semServico).artifact([
      {
        title: 'Chegar a 70 kg',
        unit: 'kg',
        currentValue: 72,
        targetValue: 70,
        progressPercent: 60,
        status: 'active',
      },
    ]);
    expect(card).toEqual({
      kind: 'progress',
      label: 'Metas',
      items: [{ title: 'Chegar a 70 kg', percent: 60, detail: '72 de 70 kg', status: 'active' }],
    });
  });

  it('conquistas: selos com o total desbloqueado', () => {
    const card = new ListAchievementsTool(semServico).artifact([
      { title: 'Primeira refeição', unlockedAt: '2026-11-01T00:00:00.000Z' },
      { title: 'Sete dias seguidos', unlockedAt: null },
    ]);
    expect(card).toEqual({
      kind: 'badges',
      label: 'Conquistas',
      unlocked: 1,
      total: 2,
      badges: [
        { title: 'Primeira refeição', unlocked: true },
        { title: 'Sete dias seguidos', unlocked: false },
      ],
    });
  });

  it('execução: os passos do primeiro exercício achado; sem achado, sem cartão', () => {
    const tool = new ExplainFormTool(semServico);
    expect(
      tool.artifact([{ name: 'Supino reto', instructions: ['Deite.', 'Desça a barra.'] }]),
    ).toEqual({ kind: 'instructions', label: 'Supino reto', steps: ['Deite.', 'Desça a barra.'] });
    expect(tool.artifact([])).toBeNull();
    expect(tool.artifact([{ name: 'Sem passos', instructions: [] }])).toBeNull();
  });

  it('exportação: o arquivo com o link e a validade', () => {
    const expiresAt = new Date('2026-11-18T10:00:00.000Z');
    const card = new ExportMyDataTool(semServico).artifact({
      url: 'https://api.fatia.app/api/exports/abc',
      expiresAt,
    });
    expect(card).toEqual({
      kind: 'file',
      label: 'Seus dados',
      url: 'https://api.fatia.app/api/exports/abc',
      filename: 'fatia-dados.json',
      expiresAt: '2026-11-18T10:00:00.000Z',
    });
  });

  it('sequência: a métrica em dias', () => {
    const activeDays = {
      periodos: 5,
      faltasUsadas: 0,
      faltasPermitidas: 1,
      periodoCorrenteEmAberto: false,
      janelaEsgotada: false,
    };
    expect(new GetStreakTool(semServico).artifact({ activeDays })).toEqual({
      kind: 'metric',
      label: 'Dias seguidos',
      value: 5,
      unit: 'dias',
    });
  });
});

describe('genericList — a Lista de quem não tem produtor próprio (#384)', () => {
  it('título pelo nome e um detalhe com rótulo', () => {
    expect(
      genericList([
        { id: 'g1', name: 'Corrida de domingo', role: 'MEMBER' },
        { id: 'g2', title: 'Dica de proteína' },
      ]),
    ).toEqual({
      kind: 'list',
      items: [{ title: 'Corrida de domingo' }, { title: 'Dica de proteína' }],
    });
  });

  it('acha a lista dentro do objeto, e sem título não há cartão', () => {
    expect(genericList({ groups: [{ name: 'A' }] })).toEqual({
      kind: 'list',
      items: [{ title: 'A' }],
    });
    expect(genericList([{ id: 'x' }])).toBeNull();
    expect(genericList({ name: 'um só' })).toBeNull();
  });
});
