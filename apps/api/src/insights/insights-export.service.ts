import { Injectable } from '@nestjs/common';
import { SUPPRESSED } from './aggregation.service';
import type { AggregateResponse } from './insights.service';

/**
 * Exportação do painel (#160) — o furo clássico, fechado pela assinatura.
 *
 * Export que gera CSV a partir do dado bruto entrega exatamente o que a tela
 * recusou a mostrar, e é o modo de falha mais provável desta issue: a supressão
 * fica na leitura do painel e o botão "exportar" faz a segunda consulta.
 *
 * Aqui não há segunda consulta possível. Este service **não tem `PrismaService`
 * no construtor** — não tem construtor nenhum — e recebe as células **já
 * suprimidas**. É uma trava barata: para burlá-la é preciso injetar um
 * repositório, o que aparece no diff. `export-suppression.spec.ts` afirma a
 * aridade do construtor justamente para que a trava não suma num refactor.
 */
@Injectable()
export class InsightsExportService {
  /** Cabeçalho fixo. Uma linha por célula, jamais uma linha por pessoa. */
  private static readonly HEADER = ['recorte', 'periodo', 'celula', 'n', 'valor'];

  toCsv(aggregate: AggregateResponse): string {
    const linhas = [InsightsExportService.HEADER.join(',')];

    for (const cell of aggregate.cells) {
      linhas.push(
        [
          aggregate.cut,
          aggregate.period,
          cell.key,
          cell.suppressed ? SUPPRESSED : String(cell.n),
          cell.suppressed ? SUPPRESSED : String(cell.value),
        ]
          .map(escapar)
          .join(','),
      );
    }

    return `${linhas.join('\n')}\n`;
  }
}

/**
 * Escapa um campo de CSV — inclusive contra fórmula.
 *
 * O eixo `muscle_group` do `modality_mix` sai de `Exercise.muscleGroup`, e
 * exercício **custom é texto do usuário**: um aluno pode nomear o grupo muscular
 * `=HYPERLINK(...)`, e o dono da academia abre o CSV no Excel. Não é injeção de
 * SQL, é injeção de planilha, e o alvo é justamente quem baixa o relatório.
 */
function escapar(campo: string): string {
  const perigoso = /^[=+\-@\t\r]/.test(campo);
  const valor = perigoso ? `'${campo}` : campo;
  return /[",\n\r]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}
