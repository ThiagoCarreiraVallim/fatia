'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import {
  alreadyMemberGroupId,
  ApiError,
  groupsApi,
  teamRoleLabel,
  type InvitePreview,
  type JoinConsent,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
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

/** Sem sessão: a comunidade e o caminho para entrar, voltando para este link. */
export function InviteSignedOut({ token, preview }: { token: string; preview: InvitePreview }) {
  const next = `/c/${token}`;
  return (
    <div className="space-y-6">
      <InviteCard preview={preview} />
      <p className="text-sm text-muted-foreground">
        Entre ou crie sua conta para aceitar. Depois você escolhe o que a equipe pode ver.
      </p>
      <div className="flex flex-col gap-2">
        <Button asChild size="lg">
          <Link href={signInHref(next)} prefetch={false}>
            Entrar para aceitar
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href={signInHref(next, 'cadastro')} prefetch={false}>
            Criar conta grátis
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** Com sessão: a escolha do que compartilhar e o aceite. */
export function InviteAccept({ token, preview }: { token: string; preview: InvitePreview }) {
  const router = useRouter();
  const qc = useQueryClient();
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

  const erro =
    accept.isError && !alreadyMemberGroupId(accept.error)
      ? accept.error instanceof ApiError && accept.error.isNotFound
        ? INVITE_UNAVAILABLE
        : 'Não deu para aceitar agora. Tente de novo.'
      : null;

  return (
    <div className="space-y-6">
      <InviteCard preview={preview} />
      <ConsentForm
        team={preview.team}
        submitLabel="Aceitar e entrar"
        pending={accept.isPending}
        error={erro}
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
