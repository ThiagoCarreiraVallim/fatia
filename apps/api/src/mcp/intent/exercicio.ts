import { NotFoundException } from '@nestjs/common';
import type { ExerciseService } from '../../workout/exercise.service';
import type { SessionSetService } from '../../workout/session-set.service';

/**
 * Quantos candidatos da busca são conferidos contra o histórico de quem pergunta: o máximo do
 * `search_exercise`. Eram cinco, e "supino" tem dezenas de variações no catálogo — o supino com
 * barra de quem treina ficava de fora, e a tool devolvia uma máquina sem histórico.
 */
const CANDIDATOS = 50;

/**
 * O exercício que a pessoa nomeou: `search_exercise` e, na ordem de relevância, o primeiro que
 * ela já treinou — "supino" é o supino de quem treina com barra, e não o primeiro em ordem
 * alfabética. Sem nenhum treinado, o mais relevante. É a composição que o agente faria no braço A
 * (`search_exercise` + `get_last_set_for_exercise`), com o histórico lido numa consulta só.
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
  const treinados = await sets.trainedAmong(
    userId,
    candidatos.map((c) => c.id),
  );
  return candidatos.find((c) => treinados.has(c.id)) ?? candidatos[0];
}
