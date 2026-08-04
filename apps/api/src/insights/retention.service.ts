import { Injectable } from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { daysBetween } from './helpers/time-buckets';
import type { Cell } from './aggregation.service';
import type { Participant } from './stats-participation.port';

/**
 * O sinal de risco de evasão (#159), e o que ele deliberadamente **não** é.
 *
 * Ele é uma **contagem por faixa**: "12 participantes em risco alto". Nunca uma
 * lista de nomes, nunca um id, nunca "a Maria não vem há 20 dias". A alternativa
 * — entregar a lista ao dono — é o que todo software de gestão de academia faz,
 * é o que o dono vai pedir, e é exatamente a promessa do pitch sendo quebrada.
 * Se um dia virar requisito, não é este arquivo: é vínculo consentido, com
 * escopo escolhido pelo aluno, e aí o alerta deixa de ser agregado.
 *
 * O sinal é calculado **só sobre engajamento**: dias desde o último treino e
 * queda de frequência. Peso parado, meta não batida e diário alimentar vazio
 * seriam preditores melhores e estão fora — a #159 existe justamente para que
 * "melhor" não decida esta pergunta.
 *
 * E a contagem sai daqui crua: quem aplica o limiar é `suppress()`, uma vez, em
 * `insights.service.ts`. Uma faixa com 2 pessoas é suprimida como qualquer
 * outra célula — inclusive porque "1 em risco alto" numa academia pequena é um
 * nome que o dono adivinha.
 */
@Injectable()
export class RetentionService {
  constructor(private readonly engagement: EngagementService) {}

  /** Faixas de risco, fechadas e nomeadas. */
  static readonly RISK_BANDS = ['baixo', 'médio', 'alto'] as const;

  /**
   * O sinal é calculado **dentro da janela pedida**: a queda de frequência
   * compara a metade recente com a metade anterior dela.
   *
   * A versão anterior usava 28 dias contra 28 dias, fixos, para qualquer período
   * — e então `last_30_days` e `last_12_months` devolviam a mesma célula com o
   * carimbo de períodos diferentes. Ou o recorte honra a janela, ou o período não
   * devia entrar na resposta dele.
   */
  async membersByChurnRisk(
    participants: readonly Participant[],
    janelaDias: number,
    now: Date,
  ): Promise<Cell[]> {
    const metadeMs = (janelaDias / 2) * 86_400_000;
    const inicioRecente = new Date(now.getTime() - metadeMs);
    const inicioAnterior = new Date(now.getTime() - 2 * metadeMs);

    const ultimoTreino = await this.engagement.lastSessionByUser(participants, inicioAnterior);

    const recentes = await this.engagement.sessionCountsBetween(participants, inicioRecente, now);
    const anteriores = await this.engagement.sessionCountsBetween(
      participants,
      inicioAnterior,
      inicioRecente,
    );

    const porFaixa = new Map<string, number>(RetentionService.RISK_BANDS.map((f) => [f, 0]));

    for (const participante of participants) {
      const sessao = ultimoTreino.get(participante.userId);
      const faixa = riskBand({
        diasSemTreinar: sessao === undefined ? Infinity : daysBetween(sessao, now),
        recentes: recentes.get(participante.userId) ?? 0,
        anteriores: anteriores.get(participante.userId) ?? 0,
        janelaDias,
      });
      porFaixa.set(faixa, (porFaixa.get(faixa) ?? 0) + 1);
    }

    return RetentionService.RISK_BANDS.map((faixa) => {
      const total = porFaixa.get(faixa) ?? 0;
      return { key: faixa, n: total, value: total };
    });
  }
}

/**
 * A regra do risco, isolada e pura para poder ser lida e testada sem banco.
 *
 * Ausência longa é o sinal forte; queda de frequência é o sinal antecedente —
 * quem treinava três vezes por semana e passou a treinar uma ainda "veio essa
 * semana", e o critério de ausência sozinho o classificaria como tranquilo.
 *
 * Os cortes são **proporcionais à janela**, e não dias absolutos: "sumido" numa
 * janela de 30 dias não é "sumido" numa de um ano. `janelaDias = 30` reproduz
 * exatamente os números que estavam escritos à mão aqui antes — 21, 10 e 7 dias,
 * e base mínima de 4 sessões —, que é como se lê que a generalização não mudou o
 * sinal, só passou a admitir as outras duas janelas.
 */
export function riskBand(input: {
  diasSemTreinar: number;
  recentes: number;
  anteriores: number;
  janelaDias?: number;
}): 'baixo' | 'médio' | 'alto' {
  const { diasSemTreinar, recentes, anteriores, janelaDias = 30 } = input;

  const ausenciaLonga = 0.7 * janelaDias; // 21 dias em 30
  const ausenciaMedia = (7 / 30) * janelaDias; // 7 dias em 30
  const ausenciaComQueda = janelaDias / 3; // 10 dias em 30
  // ~2 sessões por semana na metade anterior da janela: 4 sessões em 30 dias.
  const baseMinima = Math.max(2, Math.round(janelaDias / 7));

  // Queda só é queda se havia de onde cair: sem base anterior, uma frequência
  // baixa é alguém que acabou de chegar, não alguém que está indo embora.
  const caiuPelaMetade = anteriores >= baseMinima && recentes * 2 <= anteriores;

  if (diasSemTreinar > ausenciaLonga) return 'alto';
  if (caiuPelaMetade && diasSemTreinar > ausenciaComQueda) return 'alto';
  if (diasSemTreinar > ausenciaMedia || caiuPelaMetade) return 'médio';
  return 'baixo';
}
