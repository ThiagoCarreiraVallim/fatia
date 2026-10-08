import { NotFoundException } from '@nestjs/common';
import type { ExerciseService } from '../../workout/exercise.service';
import type { SessionSetService } from '../../workout/session-set.service';

/** Quantos candidatos da busca são conferidos contra o histórico de quem pergunta. */
const CANDIDATOS = 5;

/**
 * O exercício que a pessoa nomeou: `search_exercise` e, entre os mais relevantes,
 * o primeiro que ela já treinou (`get_last_set_for_exercise`) — "supino" é o supino de quem
 * treina com barra, e não o primeiro em ordem alfabética. É a composição que o agente faria
 * no braço A, com as mesmas duas pernas.
 */
export async function resolverExercicio(
  exercises: ExerciseService,
  sets: SessionSetService,
  userId: string,
  nome: string,
) {
  const candidatos = await exercises.search(userId, { q: nome, limit: CANDIDATOS });
  if (candidatos.length === 0) {
    throw new NotFoundException(`Nenhum exercício com "${nome}".`);
  }
  for (const candidato of candidatos) {
    if (await sets.getLastForExercise(userId, candidato.id)) return candidato;
  }
  return candidatos[0];
}
