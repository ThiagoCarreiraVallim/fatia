'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import {
  alreadyMemberGroupId,
  ApiError,
  groupsApi,
  initialsOf,
  onboardingPending,
  teamRoleLabel,
  usersApi,
  type InvitePreview,
  type JoinConsent,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { AccountForm } from '@/components/auth/account-form';
import { signInHref } from '@/lib/next-path';
import { ConsentForm } from './consent-form';

/** Inválido, vencido ou de outra conta: a mesma frase, sem dizer o motivo. */
export const INVITE_UNAVAILABLE =
  'Este convite não pode ser usado. Ele pode ter vencido, sido cancelado ou ser para outra conta.';

export function InviteCard({ preview }: { preview: InvitePreview }) {
  const { group } = preview;
  return (
    <section className="space-y-3 rounded-2xl border border-subtle bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <Users size={22} aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{group.name}</h1>
          <p className="text-xs text-muted-foreground">
            {`${preview.memberCount} ${preview.memberCount === 1 ? 'membro' : 'membros'}`}
          </p>
        </div>
      </div>
      {group.description && <p className="text-sm text-muted-foreground">{group.description}</p>}
      <p className="text-sm">
        {preview.invitedBy
          ? `${preview.invitedBy} convidou você para entrar como ${teamRoleLabel(preview.role).toLowerCase()}.`
          : `Este convite é para entrar como ${teamRoleLabel(preview.role).toLowerCase()}.`}
      </p>
      {preview.emailBound && (
        <p className="text-xs text-muted-foreground">
          Este convite vale só para a conta do e-mail que o recebeu.
        </p>
      )}
    </section>
  );
}

/**
 * Sem sessão (Onb-01a · Conta pelo convite): a capa da comunidade, quem
 * convidou e a conta. Criar conta ou entrar volta para este link, que leva ao
 * onboarding com as boas-vindas da comunidade.
 */
export function InviteSignedOut({ token, preview }: { token: string; preview: InvitePreview }) {
  const next = `/c/${token}`;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex h-[150px] items-end rounded-card bg-[linear-gradient(160deg,hsl(var(--brand)),#1a0c02)] px-6 pb-[18px]">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="anim-pop inline-flex h-14 w-14 items-center justify-center rounded-[18px] bg-brand font-display text-lg font-bold text-brand-foreground shadow-[0_0_0_3px_rgba(0,0,0,.25)]"
          >
            {initialsOf(preview.group.name)}
          </span>
          <div>
            <p className="text-[13px] font-bold text-white/80">
              {preview.invitedBy ? `${preview.invitedBy} te convidou` : 'Você foi convidado'}
            </p>
            <h1 className="font-display text-h2 text-white">{preview.group.name}</h1>
          </div>
        </div>
      </div>
      {preview.emailBound && (
        <p className="text-xs text-muted-foreground">
          Este convite vale só para a conta do e-mail que o recebeu.
        </p>
      )}
      <h2 className="anim-up font-display text-[26px] font-bold leading-tight">
        Crie sua conta para entrar
      </h2>
      <AccountForm
        next={next}
        showModeSwitch={false}
        ctaStyle={{
          background: 'hsl(var(--brand))',
          color: 'hsl(var(--brand-foreground))',
        }}
      />
      <p className="text-center text-xs text-faint">
        Já tem conta?{' '}
        <Link href={signInHref(next)} prefetch={false} className="font-bold text-primary">
          Entrar
        </Link>
      </p>
    </div>
  );
}

/** Com sessão: a escolha do que compartilhar e o aceite. */
export function InviteAccept({ token, preview }: { token: string; preview: InvitePreview }) {
  const router = useRouter();
  const qc = useQueryClient();
  // Conta nova (ou onboarding pela metade): o convite vira as boas-vindas e o
  // "o que a equipe vê" do onboarding (Onb-02 e Onb-03), não este cartão.
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const toOnboarding = me.data !== undefined && onboardingPending(me.data);
  useEffect(() => {
    if (toOnboarding) router.replace(`/onboarding?convite=${encodeURIComponent(token)}`);
  }, [toOnboarding, router, token]);
  const accept = useMutation({
    mutationFn: (consent: JoinConsent) => groupsApi.acceptInvite(token, consent),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      router.replace(`/community/${r.groupId}`);
    },
    onError: (err) => {
      const groupId = alreadyMemberGroupId(err);
      if (groupId) router.replace(`/community/${groupId}`);
    },
  });

  const error =
    accept.isError && !alreadyMemberGroupId(accept.error)
      ? accept.error instanceof ApiError && accept.error.isNotFound
        ? INVITE_UNAVAILABLE
        : // O 409 diz o que falta compartilhar, se o dono mudou a exigência
          // depois que o convite abriu.
          accept.error instanceof ApiError && accept.error.isConflict
          ? accept.error.message
          : 'Não deu para aceitar agora. Tente de novo.'
      : null;

  if (toOnboarding) return null;

  return (
    <div className="space-y-6">
      <InviteCard preview={preview} />
      <ConsentForm
        team={preview.team}
        required={preview.requiredSharingScopes}
        submitLabel="Aceitar e entrar"
        pending={accept.isPending}
        error={error}
        onSubmit={(consent) => accept.mutate(consent)}
        secondary={
          <Button asChild variant="ghost">
            <Link href="/">Agora não</Link>
          </Button>
        }
      />
    </div>
  );
}
