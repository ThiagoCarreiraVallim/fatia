import { apiFetch } from './http';

export interface MeUser {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
  timezone: string;
  heightCm: number | null;
}

export interface UpdateMeInput {
  name?: string;
  heightCm?: number;
  timezone?: string;
}

/**
 * Confirmação literal exigida para apagar a conta.
 *
 * O valor é o mesmo de `DELETE_CONFIRMATION` em
 * `apps/api/src/users/account.service.ts`, que é quem valida de fato. Está aqui
 * para que a interface possa comparar antes de enviar e habilitar o botão só com
 * o texto certo — e não para substituir a validação do servidor.
 */
export const DELETE_ACCOUNT_CONFIRMATION = 'DELETAR MINHA CONTA';

export interface DeleteAccountResult {
  deleted: true;
  logtoIdentityDeleted: boolean;
  message: string;
}

export const usersApi = {
  me: () => apiFetch<MeUser>('/api/users/me'),
  updateMe: (body: UpdateMeInput) =>
    apiFetch<MeUser>('/api/users/me', { method: 'PATCH', body: JSON.stringify(body) }),

  /**
   * Portabilidade (LGPD art. 18, V). Devolve o JSON com tudo: refeições,
   * treinos, pesos, passos, metas, perfil e o catálogo autoral (alimentos e
   * exercícios criados pela pessoa).
   *
   * `unknown` de propósito: a forma vem de `AccountService.exportData` e é uma
   * árvore grande que muda junto do schema. Tipá-la aqui daria a impressão de um
   * contrato que ninguém mantém — e o único uso é serializar e entregar.
   */
  exportMyData: () => apiFetch<unknown>('/api/users/me/export'),

  /**
   * Eliminação (LGPD art. 18, VI). Irreversível.
   *
   * `confirmation` precisa ser exatamente `DELETE_ACCOUNT_CONFIRMATION`. A
   * exigência existe porque o chamador pode ser um LLM interpretando uma frase
   * ambígua — a confirmação força a intenção a ser inequívoca.
   */
  deleteMe: (confirmation: string) =>
    apiFetch<DeleteAccountResult>('/api/users/me', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation }),
    }),
};
