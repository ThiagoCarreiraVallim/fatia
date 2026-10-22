import { ConflictException } from '@nestjs/common';
import { GroupRole, ShareScope } from '@fatia/db';

/**
 * Remove repetições mantendo a ordem do enum. Ordem estável importa porque o
 * array vai para o banco e volta para a UI — duas concessões idênticas
 * produzirem arrays diferentes faria "mudou alguma coisa?" virar chute.
 */
export function normalizarEscopos(scopes: ShareScope[]): ShareScope[] {
  const pedidos = new Set(scopes);
  return Object.values(ShareScope).filter((scope) => pedidos.has(scope));
}

/** Os mesmos rótulos do app (`SHARE_SCOPE_LABEL`): a mensagem de erro chega à tela como está. */
const SCOPE_LABEL: Record<ShareScope, string> = {
  WORKOUT: 'Treino',
  NUTRITION: 'Alimentação',
  BODY: 'Peso e medidas',
  HABITS: 'Água e passos',
  GOALS: 'Metas',
};

function labels(scopes: ShareScope[]): string {
  const nomes = normalizarEscopos(scopes).map((s) => SCOPE_LABEL[s]);
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/**
 * Escopos obrigatórios da comunidade que a escolha deixou de fora.
 *
 * A exigência é só para quem entra como `MEMBER`: a equipe é quem **recebe** o
 * compartilhamento, e um personal convidado não deve ser obrigado a abrir o
 * próprio treino para entrar na academia em que trabalha.
 */
export function missingRequiredScopes(
  role: GroupRole,
  required: readonly ShareScope[],
  chosen: readonly ShareScope[],
): ShareScope[] {
  if (role !== GroupRole.MEMBER) return [];
  const escolhidos = new Set(chosen);
  return normalizarEscopos(required.filter((s) => !escolhidos.has(s)));
}

/**
 * Barra a entrada (código, convite ou o pedido que espera aprovação) sem os
 * escopos obrigatórios. É aqui, no servidor, que a regra vale: a tela trava os
 * toggles, mas o MCP e qualquer cliente chegam a esta mesma porta.
 */
export function assertJoinMeetsRequiredScopes(
  role: GroupRole,
  required: readonly ShareScope[],
  chosen: readonly ShareScope[],
): void {
  const faltam = missingRequiredScopes(role, required, chosen);
  if (faltam.length > 0) {
    throw new ConflictException(
      `Para entrar nesta comunidade é preciso compartilhar: ${labels(faltam)}.`,
    );
  }
}

/**
 * Barra tirar um escopo obrigatório que a pessoa compartilha hoje.
 *
 * Só o que ela já compartilha conta: quem entrou antes de o dono passar a
 * exigir algo não é cobrado pelo que nunca deu — a exigência vale para entradas
 * novas, e mexer no consentimento depois não vira porta para cobrar o antigo.
 * Para parar de compartilhar um escopo obrigatório, o caminho é sair da
 * comunidade (sair continua livre e revoga tudo).
 */
export function assertKeepsRequiredScopes(
  role: GroupRole,
  required: readonly ShareScope[],
  current: readonly ShareScope[],
  next: readonly ShareScope[],
): void {
  const emVigor = required.filter((s) => current.includes(s));
  const faltam = missingRequiredScopes(role, emVigor, next);
  if (faltam.length > 0) {
    throw new ConflictException(
      `${labels(faltam)} ${faltam.length > 1 ? 'são obrigatórios' : 'é obrigatório'} nesta comunidade. Para parar de compartilhar, saia da comunidade.`,
    );
  }
}
