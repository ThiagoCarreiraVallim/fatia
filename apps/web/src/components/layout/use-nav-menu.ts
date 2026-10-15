'use client';

import { useQuery } from '@tanstack/react-query';
import { getChatAvailability, menuSections, type MenuSection } from '@fatia/api-client';

/**
 * Seções do menu do PWA. O chat entra só quando a instância tem a IA ligada
 * (na Fase 4, quando o plano da pessoa a inclui). Mesma chave e mesmo
 * `staleTime` da tela do chat: uma consulta para as duas.
 */
export function useNavMenu(): MenuSection[] {
  const availability = useQuery({
    queryKey: ['chat', 'availability'],
    queryFn: getChatAvailability,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return menuSections({ platform: 'web', chatAvailable: availability.data?.available === true });
}
