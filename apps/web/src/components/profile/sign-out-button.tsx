'use client';

import { useState } from 'react';
import { notificationsApi } from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { Icon } from '@/components/ui/icon';

const SIGN_OUT_URL = '/api/logto/sign-out';

/** Quanto esperar o navegador sair dos avisos antes de sair da conta assim mesmo. */
const PUSH_TIMEOUT_MS = 3000;

/**
 * Tira este navegador dos avisos da conta, se ele estiver inscrito. Com a
 * sessão ainda viva: depois de sair, a API não aceita mais o pedido, e a
 * inscrição continuaria entregando os avisos de quem saiu a quem usar o
 * navegador depois. Melhor esforço — falhar aqui não pode prender ninguém
 * dentro da conta.
 */
export async function leaveWebPush(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // `getRegistration`, e não `ready`: sem service worker o `ready` nunca resolve.
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  await notificationsApi.unsubscribeWebPush(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}

/**
 * "Sair da conta" com confirmação em folha (prancha Al-V1): o botão fica no fim
 * de Você, e um toque errado obrigava a entrar de novo. Botão e não `<Link>`: o
 * Next prefetcharia o handler de saída, que limpa a sessão antes do clique.
 */
export function SignOutButton() {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const signOut = async () => {
    setLeaving(true);
    await Promise.race([
      leaveWebPush().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, PUSH_TIMEOUT_MS)),
    ]);
    window.location.assign(SIGN_OUT_URL);
  };

  return (
    <>
      <Button type="button" variant="outline" size="xl" full onClick={() => setOpen(true)}>
        <Icon name="logout" size={16} />
        Sair da conta
      </Button>
      <ConfirmSheet
        open={open}
        onOpenChange={setOpen}
        title="Sair da conta?"
        description="Seus dados ficam guardados. É só entrar de novo."
        icon="logout"
        confirmLabel="Sair"
        pendingLabel="Saindo…"
        cancelLabel="Ficar"
        pending={leaving}
        onConfirm={() => void signOut()}
      />
    </>
  );
}
