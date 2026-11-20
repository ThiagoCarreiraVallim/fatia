import { apiFetch } from './http';
import type { UserGoals } from './nutrition';
import type { DistanceUnit, LoadUnit } from './units';
import { uploadMedia } from './community-content';
import type { OnboardingStepKey } from './onboarding-flow';

export type BiologicalSex = 'FEMALE' | 'MALE';
export type ActivityLevel = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE';
export type BodyObjective = 'LOSE' | 'MAINTAIN' | 'GAIN';
/** Quem vê a foto de perfil (prancha Al-V9). */
export type AvatarVisibility = 'COMMUNITIES' | 'TEAM_ONLY';

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
  /**
   * A etapa do onboarding em que a pessoa parou (#371). Preenchida, o app volta
   * ao onboarding, mesmo depois do `onboardedAt` (etapas puláveis).
   */
  onboardingStep: OnboardingStepKey | null;
  /** Como aparece nas comunidades; nulo = o primeiro nome. */
  nickname: string | null;
  bio: string | null;
  /** URL assinada de curta duração; nulo = iniciais. */
  avatarUrl: string | null;
  avatarVisibility: AvatarVisibility;
  /**
   * O servidor aceita envio de foto (bucket configurado). Falso = "Tirar foto" e
   * "Galeria" ficam desligados. Ausente na API de antes: trate como disponível.
   */
  mediaUploadEnabled?: boolean;
  /** "Guardar fotos das refeições" (ADR 038). Nulo = ainda não respondeu. */
  keepMealPhotos: boolean | null;
  /** Só dígitos, com o DDI (`5565998123456`). */
  whatsapp: string | null;
  whatsappOptIn: boolean;
  loadUnit: LoadUnit;
  distanceUnit: DistanceUnit;
}

export interface UpdateMeInput {
  name?: string;
  heightCm?: number;
  timezone?: string;
  sex?: BiologicalSex;
  birthDate?: string;
  activityLevel?: ActivityLevel;
  objective?: BodyObjective;
  /** Vazio apaga. */
  nickname?: string | null;
  bio?: string | null;
  avatarVisibility?: AvatarVisibility;
  keepMealPhotos?: boolean;
  whatsapp?: string | null;
  whatsappOptIn?: boolean;
  loadUnit?: LoadUnit;
  distanceUnit?: DistanceUnit;
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
 * O que a pessoa digita para apagar a conta (prancha Al-V8: "Digite APAGAR para
 * confirmar").
 *
 * O valor é o mesmo de `APP_DELETE_CONFIRMATION` em
 * `apps/api/src/users/account.service.ts`, que é quem valida de fato. Está aqui
 * para que a interface possa comparar antes de enviar e habilitar o botão só com
 * o texto certo — e não para substituir a validação do servidor.
 */
export const DELETE_ACCOUNT_CONFIRMATION = 'APAGAR';

/** O botão habilita com "APAGAR", "apagar" ou com espaço sobrando (a prancha faz o mesmo). */
export function isDeleteConfirmed(typed: string): boolean {
  return typed.trim().toUpperCase() === DELETE_ACCOUNT_CONFIRMATION;
}

/** O link de exportação: vale 24 h e abre sem login. */
export interface ExportLink {
  url: string;
  expiresAt: string;
}

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
   * Portabilidade (LGPD art. 18, V). Devolve um link que vale 24 h para o
   * arquivo com tudo: refeições, treinos, pesos, passos, metas, perfil e o
   * catálogo autoral. O link abre no navegador, sem login.
   */
  exportMyData: () => apiFetch<ExportLink>('/api/users/me/exports', { method: 'POST' }),

  /** A foto de perfil: o arquivo enviado com o propósito `user_avatar`. */
  setAvatar: (fileId: string) =>
    apiFetch<MeUser>('/api/users/me/avatar', {
      method: 'PUT',
      body: JSON.stringify({ fileId }),
    }),
  removeAvatar: () => apiFetch<MeUser>('/api/users/me/avatar', { method: 'DELETE' }),

  /**
   * Eliminação (LGPD art. 18, VI). Irreversível.
   *
   * `confirmation` precisa ser exatamente `DELETE_ACCOUNT_CONFIRMATION`: a
   * pessoa digitou, e o botão só habilitou com a palavra certa.
   */
  deleteMe: (confirmation: string) =>
    apiFetch<DeleteAccountResult>('/api/users/me', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation }),
    }),
};

/**
 * Troca a foto de perfil: envia o arquivo (já cortado em quadrado pelo app) e
 * aponta o perfil para ele. O servidor apaga EXIF e localização e recodifica.
 */
export async function uploadAvatar(
  file: { mime: string; bytes: number },
  put: (url: string, headers: Record<string, string>) => Promise<{ ok: boolean; status: number }>,
): Promise<MeUser> {
  const view = await uploadMedia(
    { purpose: 'user_avatar', mime: file.mime, bytes: file.bytes },
    put,
  );
  return usersApi.setAvatar(view.id);
}
