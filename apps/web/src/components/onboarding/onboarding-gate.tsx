'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@fatia/api-client';

/**
 * Manda ao assistente quem ainda não passou por ele (nem pulou, nem definiu
 * metas por outro caminho). Usa a mesma chave do dashboard, então não custa
 * uma requisição a mais; enquanto carrega, não segura a tela de ninguém.
 */
export function OnboardingGate() {
  const router = useRouter();
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const pending = me.data !== undefined && me.data.onboardedAt === null;

  useEffect(() => {
    if (pending) router.replace('/onboarding');
  }, [pending, router]);

  return null;
}
