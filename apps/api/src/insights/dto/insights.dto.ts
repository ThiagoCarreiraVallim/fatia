import { IsIn } from 'class-validator';
import { CUT_NAMES, PERIOD_NAMES, type CutName, type PeriodName } from '../cut-registry';

/**
 * O DTO **é** a política, e é por isso que ele é tão pobre.
 *
 * Dois campos, os dois de lista fechada. Não existe `where`, não existe
 * `groupBy`, não existe `from`/`to`, não existe `filter` — porque filtro livre
 * sobre agregado de saúde reconstrói o indivíduo, e recusar a resposta depois de
 * montar o filtro é tarde demais: duas consultas que passaram já dão a célula
 * suprimida por diferença.
 *
 * Quem quiser conferir a promessa da #159 não precisa ler o service: basta ler
 * este arquivo e ver que não há por onde compor um recorte.
 */
export class AggregateQueryDto {
  @IsIn(CUT_NAMES as readonly string[])
  cut!: CutName;

  @IsIn(PERIOD_NAMES as readonly string[])
  period!: PeriodName;
}
