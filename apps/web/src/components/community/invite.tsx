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
  isTeamInvite,
  onboardingPending,
  panelHref,
  TEAM_INVITE_ROLE,
  teamInviteDeclinedText,
  teamInviteHeadline,
  teamRoleLabel,
  usersApi,
  type InvitePreview,
  type JoinConsent,
  type SocialTarget,
} from '@fatia/api-client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { AccountForm } from '@/components/auth/account-form';
import { signInHref } from '@/lib/next-path';
import { brandStyle } from './brand-cover';
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
export function InviteSignedOut({
  token,
  preview,
  socialTargets,
}: {
  token: string;
  preview: InvitePreview;
  /** Google e Apple configurados no Logto (`loadSocialTargets`). */
  socialTargets: SocialTarget[];
}) {
  const next = `/c/${token}`;
  const capa = preview.group.coverUrl;
  return (
    // A cor da comunidade (#413) entra pelo `--brand`: a faixa, o selo e o botão.
    <div className="flex flex-col gap-3.5" style={brandStyle(preview.group.brandColor)}>
      <div className="relative isolate flex h-[150px] items-end overflow-hidden rounded-card bg-[linear-gradient(160deg,hsl(var(--brand)),#1a0c02)] px-6 pb-[18px]">
        {capa && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta, fora do otimizador */}
            <img src={capa} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
            {/* O nome vai em branco sobre a foto: o véu garante o contraste. */}
            <span
              aria-hidden
              className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.7))]"
            />
          </>
        )}
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
        socialTargets={socialTargets}
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
      // Equipe vai ao painel; o profissional passa antes pelo "O que você vê" (Onb-E2).
      router.replace(
        preview.role === 'PROFESSIONAL'
          ? `${panelHref(r.groupId, 'review')}/what-you-see`
          : isTeamInvite(preview.role)
            ? panelHref(r.groupId)
            : `/community/${r.groupId}`,
      );
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
  if (isTeamInvite(preview.role)) {
    return (
      <TeamInviteAccept
        preview={preview}
        pending={accept.isPending}
        error={error}
        onAccept={() => accept.mutate({ scopes: [], statsOptIn: false })}
        token={token}
      />
    );
  }

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

/**
 * Convite da equipe (#372, prancha Onb-E1): quem convidou, o papel e o que ele
 * deixa fazer, aceitos de forma explícita. "Recusar" avisa quem convidou e o
 * dono (a API manda o aviso); o convite recusado não volta a valer.
 */
function TeamInviteAccept({
  token,
  preview,
  pending,
  error,
  onAccept,
}: {
  token: string;
  preview: InvitePreview;
  pending: boolean;
  error: string | null;
  onAccept: () => void;
}) {
  const decline = useMutation({ mutationFn: () => groupsApi.declineInvite(token) });
  const papel = TEAM_INVITE_ROLE[preview.role];
  const capa = preview.group.coverUrl;

  if (decline.isSuccess) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-card bg-card px-6 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Icon name="x" size={22} />
        </span>
        <h1 className="font-display text-2xl font-extrabold">Convite recusado</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {teamInviteDeclinedText(preview.invitedBy)}
        </p>
        <Link href="/" className={buttonVariants({ variant: 'outline' })}>
          Ir para o Fatia
        </Link>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4" style={brandStyle(preview.group.brandColor)}>
      <div className="relative isolate -mx-4 -mt-4 flex h-[200px] items-end overflow-hidden bg-[linear-gradient(160deg,hsl(var(--brand)),#1a0c02)] px-6 pb-5 sm:mx-0 sm:mt-0 sm:rounded-card">
        {capa && (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta, fora do otimizador
          <img src={capa} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
        )}
        <span
          aria-hidden
          className="inline-flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-brand font-display text-2xl font-extrabold text-brand-foreground shadow-[0_0_0_4px_rgba(0,0,0,.25)]"
        >
          {initialsOf(preview.group.name)}
        </span>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{teamInviteHeadline(preview.invitedBy)}</p>
        <h1 className="font-display text-[30px] font-extrabold leading-tight">
          {preview.group.name}
        </h1>
      </div>
      {papel && (
        <>
          <div className="flex items-center gap-3 rounded-card bg-card p-4">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--info)/0.15)] text-info"
            >
              <Icon name="dumbbell" size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block">{papel.title}</b>
              <span className="text-[13px] text-muted-foreground">{papel.sub}</span>
            </span>
            <span className="rounded-full bg-[hsl(var(--info)/0.15)] px-2.5 py-1 text-[11px] font-bold uppercase text-info">
              Papel
            </span>
          </div>
          <ul
            aria-label="O que o papel deixa fazer"
            className="divide-y divide-border rounded-card bg-card"
          >
            {papel.permissions.map((p) => (
              <li key={p} className="flex items-center gap-3 px-4 py-3.5 text-[15px]">
                <Icon name="check" size={18} className="shrink-0 text-primary" />
                {p}
              </li>
            ))}
          </ul>
        </>
      )}
      {preview.emailBound && (
        <p className="text-xs text-muted-foreground">
          Este convite vale só para a conta do e-mail que o recebeu.
        </p>
      )}
      {(error || decline.isError) && (
        <p role="alert" className="text-sm text-danger">
          {error ?? 'Não deu para recusar agora. Tente de novo.'}
        </p>
      )}
      <Button
        variant="brand"
        size="xl"
        full
        disabled={pending || decline.isPending}
        onClick={onAccept}
      >
        {pending ? 'Entrando…' : 'Aceitar e entrar'}
      </Button>
      <Button
        variant="text"
        disabled={pending || decline.isPending}
        onClick={() => decline.mutate()}
      >
        Recusar
      </Button>
    </div>
  );
}
