'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { notificationsApi } from '@fatia/api-client';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

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
 * "Sair da conta" com confirmação, como no app: o botão fica no fim do perfil,
 * logo abaixo de "Apagar minha conta", e um toque errado obrigava a entrar de
 * novo. Botão e não `<Link>`: o Next prefetcharia o handler de saída, que
 * limpa a sessão antes do clique.
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-danger/50 bg-transparent px-4 py-4 text-base font-bold text-danger transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LogOut size={18} aria-hidden />
        Sair da conta
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Sair da conta"
        description="Você vai precisar entrar de novo para usar o Fatia."
        confirmLabel="Sair"
        pendingLabel="Saindo…"
        pending={leaving}
        onConfirm={() => void signOut()}
      />
    </>
  );
}
