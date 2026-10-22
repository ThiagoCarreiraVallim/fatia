'use client';

import { useQuery } from '@tanstack/react-query';
import { getChatAvailability, menuSections, type MenuSection } from '@fatia/api-client';

/**
 * Seções do menu do PWA. O chat entra só quando a instância tem a IA ligada;
 * para quem está no Free (ADR 024) ele aparece com cadeado e leva ao plano.
 * Mesma chave e mesmo `staleTime` da tela do chat: uma consulta para as duas.
 */
export function useNavMenu(): MenuSection[] {
  const availability = useQuery({
    queryKey: ['chat', 'availability'],
    queryFn: getChatAvailability,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const data = availability.data;
  return menuSections({
    platform: 'web',
    chatAvailable: data?.available === true,
    chatLocked:
      data?.available === true && data.allowed === false && data.reason === 'plan_required',
  });
}
