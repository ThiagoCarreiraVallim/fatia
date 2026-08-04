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

  /** Janela de comparação da queda de frequência: 4 semanas contra as 4 anteriores. */
  private static readonly JANELA_MS = 28 * 86_400_000;

  async membersByChurnRisk(participants: readonly Participant[], now: Date): Promise<Cell[]> {
    const ultimoTreino = await this.engagement.lastSessionByUser(participants);

    const inicioRecente = new Date(now.getTime() - RetentionService.JANELA_MS);
    const inicioAnterior = new Date(now.getTime() - 2 * RetentionService.JANELA_MS);

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
 */
export function riskBand(input: {
  diasSemTreinar: number;
  recentes: number;
  anteriores: number;
}): 'baixo' | 'médio' | 'alto' {
  const { diasSemTreinar, recentes, anteriores } = input;

  // Queda só é queda se havia de onde cair: sem base anterior, uma frequência
  // baixa é alguém que acabou de chegar, não alguém que está indo embora.
  const caiuPelaMetade = anteriores >= 4 && recentes * 2 <= anteriores;

  if (diasSemTreinar > 21) return 'alto';
  if (caiuPelaMetade && diasSemTreinar > 10) return 'alto';
  if (diasSemTreinar > 7 || caiuPelaMetade) return 'médio';
  return 'baixo';
}
