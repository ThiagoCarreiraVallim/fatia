import { socialTargets, type PublicSignInExperience, type SocialTarget } from '@fatia/api-client';

/**
 * Google e Apple que o Logto tem configurados, pela página pública da
 * experiência de login. Sem conector o botão some: `direct_sign_in` para um
 * conector inexistente cairia na tela de senha do Logto (ADR 050).
 */
export async function loadSocialTargets(): Promise<SocialTarget[]> {
  const endpoint = (process.env.LOGTO_ENDPOINT ?? '').replace(/\/+$/, '');
  if (!endpoint) return [];
  try {
    const res = await fetch(`${endpoint}/api/.well-known/sign-in-exp`, {
      next: { revalidate: 300 },
    } as RequestInit);
    if (!res.ok) return [];
    return socialTargets((await res.json()) as PublicSignInExperience);
  } catch {
    return [];
  }
}
