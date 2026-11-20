import type { AiEntitlement } from '../billing/ai-entitlement';

/** De onde vem o PRO da pessoa. */
export type ProOrigin = 'PERSONAL' | 'COMMUNITY' | 'PROGRAM' | 'INSTANCE';

export interface ProStatus {
  tier: 'FREE' | 'PRO';
  origin: ProOrigin | null;
  community: string | null;
  program: string | null;
  until: string | null;
}

export function proStatusOf(_direito: AiEntitlement): ProStatus {
  throw new Error('não implementado');
}
