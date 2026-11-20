import Link from 'next/link';
import { AccountForm } from '@/components/auth/account-form';
import { safeNextPath } from '@/lib/next-path';
import { loadSocialTargets } from '@/lib/social-targets';

type Props = { searchParams: Promise<{ next?: string; modo?: string }> };

/**
 * Onb-01b · Conta direta: criar conta ou entrar, Google e Apple. `?next=` (o
 * link de convite, por exemplo) segue junto para a pessoa voltar a ele depois.
 * Os links ao Logto não fazem prefetch: um prefetch dispararia o OAuth antes do clique.
 */
export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const socialTargets = await loadSocialTargets();

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-3.5 overflow-hidden px-6 pb-8 pt-[calc(env(safe-area-inset-top)+3rem)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[90px] top-10 h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.25),transparent_70%)]"
      />
      <div className="relative flex flex-col gap-4">
        <span
          aria-hidden
          className="anim-pop font-display text-[28px] font-bold tracking-tight text-primary"
        >
          Fatia
        </span>
        <h1 className="anim-up font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em]">
          Comer e treinar,
          <br />
          registrado em segundos.
        </h1>
      </div>
      <div className="mt-2">
        <AccountForm
          next={next}
          mode={params.modo === 'entrar' ? 'login' : 'create'}
          socialTargets={socialTargets}
        />
      </div>
      <div className="flex-1" />
      <p className="text-center text-xs text-faint">
        Ao continuar você aceita os{' '}
        <Link href="/terms" className="underline">
          Termos
        </Link>{' '}
        e a{' '}
        <Link href="/privacy" className="underline">
          Privacidade
        </Link>
      </p>
    </div>
  );
}
