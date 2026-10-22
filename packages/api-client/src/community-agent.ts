import { apiFetch } from './http';
import type { MediaView } from './community-content';

/**
 * O agente da comunidade no chat (Fase 7c, ADR 031): o dono dá nome, avatar e
 * orientações; quem é da comunidade escolhe o agente numa conversa nova. As
 * regras e o que o assistente enxerga não mudam — quem garante é a API e o
 * agente; aqui ficam os limites e os textos, iguais na web e no app.
 */

/** Limites iguais aos da API (`group-agent.service.ts`) e do agente (`ChatPersona`). */
export const AGENT_NAME_MIN = 2;
export const AGENT_NAME_MAX = 40;
export const AGENT_INSTRUCTIONS_MAX = 2000;

export interface GroupAgent {
  /** Falso enquanto o dono nunca salvou. */
  configured: boolean;
  name: string;
  instructions: string;
  enabled: boolean;
  avatar: MediaView | null;
  updatedAt: string | null;
}

export interface GroupAgentInput {
  name: string;
  instructions: string;
  enabled: boolean;
  /** Ausente mantém o avatar; `null` tira. */
  avatarFileId?: string | null;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const groupAgentApi = {
  get: (groupId: string) => apiFetch<GroupAgent>(`/api/groups/${groupId}/agent`),
  put: (groupId: string, input: GroupAgentInput) =>
    apiFetch<GroupAgent>(`/api/groups/${groupId}/agent`, json('PUT', input)),
};

/** O nome sugerido quando o dono ainda não configurou. */
export function suggestedAgentName(communityName: string): string {
  const nome = `Assistente ${communityName}`.trim();
  return nome.length <= AGENT_NAME_MAX ? nome : nome.slice(0, AGENT_NAME_MAX).trimEnd();
}

/** O que impede salvar, ou `null`. Mesmas regras da API, com o texto da tela. */
export function agentProblem(input: Pick<GroupAgentInput, 'name' | 'instructions'>): string | null {
  const nome = input.name.trim();
  if (nome.length < AGENT_NAME_MIN) return 'Dê um nome ao agente.';
  if (nome.length > AGENT_NAME_MAX) return `O nome tem até ${AGENT_NAME_MAX} caracteres.`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>]/.test(nome))
    return 'O nome não pode ter quebra de linha nem < ou >.';
  if (input.instructions.trim().length > AGENT_INSTRUCTIONS_MAX) {
    return `As orientações têm até ${AGENT_INSTRUCTIONS_MAX} caracteres.`;
  }
  return null;
}
