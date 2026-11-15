'use client';

import { useQuery } from '@tanstack/react-query';
import { unitPrefsOf, usersApi, type UnitPrefs } from '@fatia/api-client';

/**
 * As unidades de exibição da pessoa (Você › Unidades, #387). Mesma consulta do
 * perfil; enquanto ela não chega, vale o padrão do Brasil (kg e km).
 */
export function useUnitPrefs(): UnitPrefs {
  const me = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => usersApi.me(),
    staleTime: 5 * 60_000,
  });
  return unitPrefsOf(me.data);
}
