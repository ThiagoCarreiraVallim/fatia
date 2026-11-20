import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usersApi, withIdentity, type MeUser } from '@fatia/api-client';
import { useAuth } from './auth-context';

/**
 * A cada sessão aberta ou restaurada, manda o ID token à API, que grava o
 * e-mail e o nome reais (ADR 050) — e corrige quem ainda está com e-mail
 * provisório. Depois de um cadastro, grava também o nome digitado (o Logto 1.30
 * pode não guardá-lo). Falhar aqui não muda nada na sessão.
 */
export function IdentitySync() {
  const { status, sessionVersion, getIdToken, takeSignupName } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (status !== 'signedIn' || sessionVersion === 0) return;
    const idToken = getIdToken();
    const name = takeSignupName();
    void (async () => {
      const identity = idToken ? await usersApi.syncIdentity(idToken).catch(() => null) : null;
      if (identity) qc.setQueryData<MeUser>(['users', 'me'], (me) => withIdentity(me, identity));
      if (name) await usersApi.updateMe({ name }).catch(() => undefined);
      await qc.invalidateQueries({ queryKey: ['users', 'me'] });
    })();
  }, [status, sessionVersion, getIdToken, takeSignupName, qc]);

  return null;
}
