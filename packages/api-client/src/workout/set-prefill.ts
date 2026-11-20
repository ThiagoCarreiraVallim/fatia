import type { PrescribedSet, SessionSet } from '../workout';

/**
 * De onde sai o palpite de carga e repetições da próxima série.
 *
 * Mora aqui, e não em cada app, porque web e mobile precisam da **mesma**
 * resposta: a paridade da sessão de treino foi auditada na #130, e duas cópias
 * da regra são a forma mais barata de recriar a divergência que a auditoria
 * fechou. A dependência é só `SessionSet`, que já é daqui.
 *
 * A ordem é: série já registrada **nesta** sessão manda, inclusive por cima do
 * que a pessoa digitou — acabou de levantar aquilo, é o sinal mais recente que
 * existe. Sem série nesta sessão, e enquanto ninguém tiver mexido nos campos,
 * vale a última série do exercício numa sessão **anterior**.
 *
 * O recorde pessoal ficou de fora de propósito (#190). Ele é a maior carga já
 * levantada na vida: propô-la na série de abertura ancora a pessoa no teto
 * justamente na série fria, e um toque em "concluir série" grava um PR que não
 * aconteceu — que por sua vez vira o novo teto proposto e distorce o gráfico de
 * progresso para sempre. Sem referência anterior o certo é não sugerir nada:
 * campo vazio é uma pergunta, campo com o número errado é uma resposta errada.
 * O recorde continua visível ao lado do campo, como referência.
 *
 * A prescrição (#144) entra **no lugar** da série anterior, não do recorde: ela
 * também parte de uma sessão que a pessoa de fato completou, mas com teto por
 * sessão, por semana e contra o recorde — nunca mais de 5% acima da carga base.
 * Isso é o oposto do que a #190 corrigiu, e é a razão de ela poder preencher o
 * campo: copiar a última série é o palpite que nunca progride, e a prescrição é
 * o mesmo palpite com um passo que o histórico justifica. Quando não há
 * prescrição — menos de duas sessões — a ordem antiga continua valendo.
 */
export function prefillForNextSet({
  touched,
  sessionLastSet,
  previousSessionSet,
  prescription,
}: {
  touched: boolean;
  sessionLastSet?: SessionSet | null;
  previousSessionSet?: SessionSet | null;
  prescription?: PrescribedSet | null;
}): SetPrefill {
  if (sessionLastSet) {
    return { weightKg: sessionLastSet.weightKg, reps: sessionLastSet.reps };
  }
  if (touched) return { weightKg: null, reps: null };
  if (prescription) {
    return { weightKg: prescription.weightKg, reps: prescription.reps };
  }
  return {
    weightKg: previousSessionSet?.weightKg ?? null,
    reps: previousSessionSet?.reps ?? null,
  };
}

/** Palpite para os campos da próxima série. `null` num campo = não mexer nele. */
export interface SetPrefill {
  weightKg: number | null;
  reps: number | null;
}

/**
 * O que a pessoa digitou para a série em andamento de um exercício. "Como
 * fazer" é outra tela e a sessão guiada pode ser remontada na volta: o
 * rascunho fica no cache e volta para a mesma série.
 */
export interface SetDraft {
  /** Quantas séries estavam registradas: o rascunho é da série seguinte. */
  doneSets: number;
  weightKg: number;
  reps: number;
  feeling: number | null;
  touched: boolean;
  /** O último palpite aplicado, para a volta não sobrescrever o que foi digitado. */
  prefill: { weightKg: number | null; reps: number | null };
}

export const setDraftKey = (sessionId: string, exerciseId: number) =>
  ['workout', 'set-draft', sessionId, exerciseId] as const;

/** O rascunho, se ainda for da série em andamento. */
export function restoreSetDraft(draft: SetDraft | undefined, doneSets: number): SetDraft | null {
  return draft && draft.doneSets === doneSets ? draft : null;
}
