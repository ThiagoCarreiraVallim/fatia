import type { StreakResult } from './progress';

/**
 * Texto do card de sequência, compartilhado entre o PWA e o app nativo.
 *
 * Mora aqui pelo mesmo motivo de `getRpeInfo`: é regra de apresentação que os dois apps precisam
 * dizer **igual**. Se cada um tivesse a sua cópia, um diria "1 falta usada" e o outro "sequência
 * protegida", e a pessoa concluiria que um dos dois está errado.
 *
 * A frase da tolerância não é enfeite. Reescrever o cálculo muda o número na cara do usuário —
 * quem tinha 3 acorda com 11 depois do deploy —, e sem a regra explicada na tela isso vira "o app
 * está inventando".
 */

export type UnidadeDeSequencia = 'dias' | 'semanas';

const SINGULAR: Record<UnidadeDeSequencia, string> = { dias: 'dia', semanas: 'semana' };

/** "12 dias", "1 semana", "365+ dias" quando a sequência encosta no teto da janela varrida. */
export function rotuloDeSequencia(streak: StreakResult, unidade: UnidadeDeSequencia): string {
  const palavra = streak.periodos === 1 ? SINGULAR[unidade] : unidade;
  // O `+` é o que impede o número de parecer travado para quem passa de um ano: a sequência real
  // pode ser maior, e a janela é limite de consulta, não de mérito.
  return `${streak.periodos}${streak.janelaEsgotada ? '+' : ''} ${palavra}`;
}

/**
 * A linha de baixo do card. `null` quando não há nada honesto a dizer — melhor uma linha a menos
 * que uma frase de enchimento.
 */
export function legendaDeTolerancia(
  streak: StreakResult,
  unidade: UnidadeDeSequencia,
): string | null {
  if (streak.periodos === 0) {
    return unidade === 'dias'
      ? 'Registre uma refeição, um treino ou seus passos para começar.'
      : 'Conclua um treino nesta semana para começar.';
  }

  if (streak.faltasUsadas > 0) {
    // Concorda com o TOTAL, não com o usado: em "1 de 2", quem manda no plural é o 2.
    const plural = streak.faltasPermitidas === 1 ? 'falta usada' : 'faltas usadas';
    return `${streak.faltasUsadas} de ${streak.faltasPermitidas} ${plural} — a sequência segue.`;
  }

  if (streak.periodoCorrenteEmAberto) {
    // Não é cobrança: o período ainda não acabou e não conta como falta. Dizer isso é o que
    // evita o empurrão para "registrar qualquer coisa" que a issue quer evitar.
    return unidade === 'dias'
      ? 'Hoje ainda está em aberto — o dia não acabou.'
      : 'Esta semana ainda está em aberto.';
  }

  return null;
}
