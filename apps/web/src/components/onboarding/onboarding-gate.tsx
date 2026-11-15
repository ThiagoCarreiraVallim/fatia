'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { onboardingPending, usersApi } from '@fatia/api-client';

/**
 * Manda ao assistente quem ainda não passou por ele (nem pulou, nem definiu
 * metas por outro caminho). Usa a mesma chave do dashboard, então não custa
 * uma requisição a mais; enquanto carrega, não segura a tela de ninguém.
 * Também volta quem concluiu as metas mas parou numa etapa pulável (#371): a
 * retomada leva à mesma tela.
 *
 * Quem chegou por um link (uma comunidade, depois do convite) volta para ele no
 * fim do assistente, em vez de cair no Início.
 */
export function OnboardingGate() {
  const router = useRouter();
  const pathname = usePathname();
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const pending = me.data !== undefined && onboardingPending(me.data);

  useEffect(() => {
    if (!pending) return;
    router.replace(
      pathname && pathname !== '/'
        ? `/onboarding?next=${encodeURIComponent(pathname)}`
        : '/onboarding',
    );
  }, [pending, pathname, router]);

  return null;
}
