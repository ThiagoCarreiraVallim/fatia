import 'reflect-metadata';
import { InsightsExportService } from '../insights-export.service';
import { suppress } from '../aggregation.service';
import type { AggregateResponse } from '../insights.service';

/**
 * O export não pode ser a porta dos fundos da supressão (#160).
 *
 * O modo de falha é conhecido e comum: a tela suprime, o botão "exportar" faz
 * uma segunda consulta ao banco e o CSV sai com tudo. O usuário do relatório
 * nunca desconfia — os dois vieram do mesmo painel.
 */
describe('InsightsExportService', () => {
  const exporter = new InsightsExportService();

  const recorte = (cut: AggregateResponse['cut'] = 'sessions_by_hour_band'): AggregateResponse => ({
    cut,
    period: 'last_30_days',
    ...suppress([
      { key: 'manhã', n: 20, value: 140 },
      { key: 'noite', n: 18, value: 96 },
      { key: 'tarde', n: 3, value: 11 },
    ]),
  });

  it('não tem repositório para fazer a segunda consulta', () => {
    // A trava é a assinatura: sem `PrismaService` no construtor não existe
    // caminho até o banco, e reintroduzi-lo aparece no diff como uma injeção
    // nova — que é a conversa que se quer ter.
    expect(InsightsExportService.length).toBe(0);

    const injetados = Reflect.getMetadata('design:paramtypes', InsightsExportService) as
      unknown[] | undefined;
    expect(injetados ?? []).toEqual([]);
  });

  it('serializa a marca de supressão, nunca o número suprimido', () => {
    const csv = exporter.toCsv(recorte());

    expect(csv).toContain('sessions_by_hour_band,last_30_days,manhã,20,140');
    expect(csv).toContain('tarde,SUPPRESSED,SUPPRESSED');
    // 11 é a sessão da célula de 3 pessoas; 96 é o complemento que caiu junto.
    expect(csv).not.toContain('11');
    expect(csv).not.toContain('96');
    expect(csv).not.toContain(',3,');
  });

  it('suprime o `n` junto — "somos 3 aqui" também é o vazamento', () => {
    const csv = exporter.toCsv(recorte());
    const linhaTarde = csv.split('\n').find((linha) => linha.includes('tarde'));

    expect(linhaTarde).toBe('sessions_by_hour_band,last_30_days,tarde,SUPPRESSED,SUPPRESSED');
  });

  it('recorte inteiramente suprimido gera cabeçalho e nenhuma linha numérica', () => {
    const vazio: AggregateResponse = {
      cut: 'retention_by_cohort',
      period: 'last_12_months',
      cells: [],
      insufficientSample: true,
    };

    const csv = exporter.toCsv(vazio);

    // Nem exceção, nem CSV vazio: cabeçalho, e o download acontece. Erro 500
    // aqui viraria "o export está quebrado" e a pressão para "consertar" seria
    // pela segunda consulta.
    expect(csv).toBe('recorte,periodo,celula,n,valor\n');
    expect(csv.split('\n').filter((linha) => /\d/.test(linha))).toEqual([]);
  });

  it('neutraliza fórmula no rótulo da célula', () => {
    // `modality_mix` tem por eixo `Exercise.muscleGroup`, e exercício custom é
    // texto do aluno. O alvo da injeção de planilha é justamente quem baixa o
    // relatório: o dono da academia.
    const malicioso: AggregateResponse = {
      cut: 'modality_mix',
      period: 'last_90_days',
      cells: [
        { key: '=HYPERLINK("http://x","clique")', value: 40, n: 12, suppressed: false },
        { key: 'peito, costas', value: 30, n: 9, suppressed: false },
      ],
      insufficientSample: false,
    };

    const csv = exporter.toCsv(malicioso);

    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""clique"")"`);
    expect(csv).toContain('"peito, costas"');
    // A vírgula do rótulo não pode virar coluna nova.
    expect(csv.split('\n')[2].split('","').length).toBeGreaterThan(0);
  });
});
