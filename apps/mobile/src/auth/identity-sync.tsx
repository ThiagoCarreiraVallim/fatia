import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usersApi, withIdentity, type MeUser } from '@fatia/api-client';
import { useAuth } from './auth-context';

/**
 * A cada ID token novo (login ou refresh — nunca o guardado no cofre, que
 * depois de uma troca de e-mail traz o e-mail velho), manda o token à API, que
 * grava o e-mail e o nome reais (ADR 050) — e corrige quem ainda está com
 * e-mail provisório. Depois de um cadastro, grava também o nome digitado (o Logto 1.30
 * pode não guardá-lo). Falhar aqui não muda nada na sessão.
 */
export function IdentitySync() {
  const { status, freshIdentity, takeSignupName } = useAuth();
  const qc = useQueryClient();
  const sent = useRef(0);

  useEffect(() => {
    if (status !== 'signedIn' || !freshIdentity || freshIdentity.version === sent.current) return;
    sent.current = freshIdentity.version;
    const idToken = freshIdentity.idToken;
    const name = takeSignupName();
    void (async () => {
      const identity = idToken ? await usersApi.syncIdentity(idToken).catch(() => null) : null;
      if (identity) qc.setQueryData<MeUser>(['users', 'me'], (me) => withIdentity(me, identity));
      if (name) await usersApi.updateMe({ name }).catch(() => undefined);
      await qc.invalidateQueries({ queryKey: ['users', 'me'] });
    })();
  }, [status, freshIdentity, takeSignupName, qc]);

  return null;
}
