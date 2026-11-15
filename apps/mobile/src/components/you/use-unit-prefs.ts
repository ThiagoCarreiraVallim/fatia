import { useQuery } from '@tanstack/react-query';
import { unitPrefsOf, usersApi, type UnitPrefs } from '@fatia/api-client';

/** As unidades de exibição da pessoa (#387); sem o perfil, o padrão do Brasil. */
export function useUnitPrefs(): UnitPrefs {
  const me = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => usersApi.me(),
    staleTime: 5 * 60_000,
  });
  return unitPrefsOf(me.data);
}
