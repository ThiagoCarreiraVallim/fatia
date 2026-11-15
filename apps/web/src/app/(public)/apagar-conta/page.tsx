import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { Toaster } from '@/components/ui/toaster';
import { DeleteAccountScreen } from '@/components/you/delete-account-screen';
import { getCurrentUser } from '@/lib/auth-server';
import { signInHref } from '@/lib/next-path';

export const metadata: Metadata = {
  title: 'Apagar conta — Fatia',
  description: 'Como apagar sua conta do Fatia e todos os dados, sem o app.',
};

/**
 * `fat.ia.br/apagar-conta` (#387): o caminho fora do app que as lojas pedem
 * (Google Play exige um link público para pedir a exclusão). Pública, sem o
 * gate de `(app)`: quem não entrou vê o que acontece e o botão para entrar;
 * quem entrou vê a mesma tela de Você › Apagar conta (prancha Al-V8).
 */
export default async function DeleteAccountPublicPage() {
  const user = await getCurrentUser();

  if (user) {
    return (
      <div className="mx-auto max-w-md">
        <DeleteAccountScreen cancelHref="/you" />
        <Toaster />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[hsl(var(--danger)/0.14)] text-danger">
        <Icon name="trash" size={28} />
      </span>
      <h1 className="font-display text-[28px] font-bold leading-tight">Apagar sua conta</h1>
      <p className="text-[15px] text-muted-foreground">
        Apagar a conta remove refeições, treinos, pesos, passos, metas e conversas com a IA. Não dá
        para recuperar.
      </p>
      <p className="text-[15px] text-muted-foreground">
        Entre com a conta que você quer apagar. Antes de confirmar, dá para exportar uma cópia dos
        seus dados.
      </p>
      <p className="text-[13px] text-muted-foreground">
        PRO assinado na App Store ou no Google Play: cancele também na loja.
      </p>
      {/* prefetch={false}: o handler inicia o fluxo OAuth por redirect. */}
      <Link
        href={signInHref('/apagar-conta')}
        prefetch={false}
        className="inline-flex h-[52px] items-center justify-center rounded-field bg-primary px-6 text-[15px] font-bold text-primary-foreground"
      >
        Entrar para apagar
      </Link>
      <p className="text-[13px] text-muted-foreground">
        Não consegue entrar? Escreva para o suporte pelo e-mail da{' '}
        <Link href="/privacy" className="underline">
          política de privacidade
        </Link>
        .
      </p>
    </div>
  );
}
