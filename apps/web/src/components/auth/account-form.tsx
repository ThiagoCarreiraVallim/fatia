'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { signInHref } from '@/lib/next-path';

/**
 * A etapa 1 do onboarding (Onb-01a e Onb-01b): nome, e-mail, Google e Apple.
 *
 * A senha não aparece aqui de propósito: ela é digitada na tela do Logto, e o
 * app nunca a vê (ADR 008). O formulário leva o nome e o e-mail a
 * `/api/logto/sign-in`, que preenche o e-mail lá (`login_hint`) e guarda o nome
 * para o perfil. Google e Apple pulam a tela do Logto (`direct_sign_in`).
 */
export function AccountForm({
  next,
  mode: initialMode = 'create',
  showModeSwitch = true,
  createLabel = 'Criar conta',
  ctaStyle,
}: {
  next: string | null;
  mode?: 'create' | 'login';
  showModeSwitch?: boolean;
  createLabel?: string;
  /** A cor da comunidade no botão principal (Onb-01a). */
  ctaStyle?: CSSProperties;
}) {
  const [mode, setMode] = useState(initialMode);
  const create = mode === 'create';
  const inputClass =
    'h-[52px] w-full rounded-field border-[1.5px] border-transparent bg-card px-[18px] text-base text-foreground outline-none placeholder:text-faint focus:border-primary focus:shadow-[0_0_0_4px_hsl(var(--primary-soft))]';

  return (
    <div className="flex flex-col gap-3.5">
      {showModeSwitch && (
        <div role="tablist" aria-label="Conta" className="flex gap-1 rounded-[16px] bg-card p-1">
          {(
            [
              ['create', 'Criar conta'],
              ['login', 'Entrar'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                'h-11 flex-1 rounded-[12px] text-sm font-semibold transition-colors duration-fast',
                mode === value ? 'bg-foreground text-background' : 'text-muted-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <form action="/api/logto/sign-in" method="get" className="flex flex-col gap-3">
        {create && <input type="hidden" name="tela" value="cadastro" />}
        {next && <input type="hidden" name="next" value={next} />}
        {create && (
          <label className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-muted-foreground">Seu nome</span>
            <input
              name="nome"
              autoComplete="name"
              maxLength={80}
              placeholder="Como te chamam"
              className={inputClass}
            />
          </label>
        )}
        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-muted-foreground">E-mail</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="voce@email.com"
            className={inputClass}
          />
        </label>
        <p className="text-xs text-faint">
          A senha você digita na próxima tela, a de login segura.
        </p>
        <button
          type="submit"
          style={ctaStyle}
          className="flex h-[52px] w-full items-center justify-center rounded-[16px] bg-primary px-6 text-[15px] font-bold text-primary-foreground transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {create ? createLabel : 'Entrar'}
        </button>
      </form>
      <div className="flex items-center gap-3 text-xs text-faint">
        <i aria-hidden className="h-px flex-1 bg-subtle" />
        ou
        <i aria-hidden className="h-px flex-1 bg-subtle" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Link
          href={signInHref(next, undefined, { social: 'google' })}
          prefetch={false}
          className="flex h-12 items-center justify-center rounded-[14px] bg-card text-sm font-bold"
        >
          Google
        </Link>
        <Link
          href={signInHref(next, undefined, { social: 'apple' })}
          prefetch={false}
          className="flex h-12 items-center justify-center rounded-[14px] bg-[#e5e2e1] text-sm font-bold text-[#111]"
        >
          Apple
        </Link>
      </div>
      {!create && (
        <Link
          href={signInHref(next, 'senha')}
          prefetch={false}
          className="self-center text-xs font-semibold text-muted-foreground underline"
        >
          Esqueci minha senha
        </Link>
      )}
    </div>
  );
}
