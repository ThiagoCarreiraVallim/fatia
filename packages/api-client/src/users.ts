import { apiFetch } from './http';
import type { UserGoals } from './nutrition';

export type BiologicalSex = 'FEMALE' | 'MALE';
export type ActivityLevel = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE';
export type BodyObjective = 'LOSE' | 'MAINTAIN' | 'GAIN';

export interface MeUser {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
  timezone: string;
  heightCm: number | null;
  sex: BiologicalSex | null;
  /** ISO; a parte da data (AAAA-MM-DD) é o dia de nascimento. */
  birthDate: string | null;
  activityLevel: ActivityLevel | null;
  objective: BodyObjective | null;
  /** Nulo = ainda não passou pelo assistente de primeira vez. */
  onboardedAt: string | null;
}

export interface UpdateMeInput {
  name?: string;
  heightCm?: number;
  timezone?: string;
  sex?: BiologicalSex;
  birthDate?: string;
  activityLevel?: ActivityLevel;
  objective?: BodyObjective;
}

export interface OnboardingProfile {
  sex: BiologicalSex;
  /** AAAA-MM-DD. */
  birthDate: string;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  objective: BodyObjective;
}

export type GoalsInput = Omit<UserGoals, 'userId'>;

export interface CompleteOnboardingInput extends OnboardingProfile {
  goals: GoalsInput;
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

  /** Perfil, pesagem e metas numa transação; marca o assistente como feito. */
  completeOnboarding: (body: CompleteOnboardingInput) =>
    apiFetch<{ onboardedAt: string; goals: UserGoals }>('/api/users/me/onboarding', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /** "Pular por agora": não pergunta de novo e não mexe nas metas. */
  skipOnboarding: () =>
    apiFetch<{ onboardedAt: string }>('/api/users/me/onboarding/skip', { method: 'POST' }),

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
