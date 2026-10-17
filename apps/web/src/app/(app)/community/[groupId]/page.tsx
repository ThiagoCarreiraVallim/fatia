'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Crown, ShieldCheck } from 'lucide-react';
import {
  ApiError,
  consentSummary,
  groupsApi,
  joinPolicyLabel,
  SHARE_SCOPE_LABEL,
  teamRoleLabel,
  type JoinConsent,
} from '@fatia/api-client';
import { ConsentForm } from '@/components/community/consent-form';
import { communityKeys } from '@/components/community/query-keys';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

const quando = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace('.', '');

/**
 * Uma comunidade, do ponto de vista do membro: quem é a equipe, o que eu
 * compartilho com ela (e posso mudar), quem olhou meus dados, o assento e sair.
 */
export default function CommunityDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [leaving, setLeaving] = useState(false);

  const group = useQuery({
    queryKey: communityKeys.group(groupId),
    queryFn: () => groupsApi.get(groupId),
  });
  const ativo = group.data?.status === 'ACTIVE';
  const members = useQuery({
    queryKey: communityKeys.members(groupId),
    queryFn: () => groupsApi.members(groupId),
    enabled: ativo,
  });
  const log = useQuery({
    queryKey: communityKeys.accessLog(groupId),
    queryFn: () => groupsApi.accessLog({ groupId, limit: 20 }),
    enabled: ativo,
  });
  useTopBarTitle(group.data?.name);

  const save = useMutation({
    mutationFn: (consent: JoinConsent) => groupsApi.setConsent(groupId, consent),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      toast(`Compartilhando: ${consentSummary(r.scopes)}.`);
    },
  });
  const leave = useMutation({
    mutationFn: () => groupsApi.leave(groupId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      void qc.invalidateQueries({ queryKey: ['billing'] });
      router.replace('/community');
    },
  });

  if (group.isPending) {
    return (
      <div aria-busy="true" className="space-y-3 p-4">
        <Skeleton className="h-24 rounded-2xl bg-card" />
        <Skeleton className="h-64 rounded-2xl bg-card" />
      </div>
    );
  }
  if (group.isError) {
    const sumiu = group.error instanceof ApiError && group.error.isNotFound;
    return (
      <div className="p-4">
        <EmptyState
          title={sumiu ? 'Comunidade não encontrada' : 'Não deu para carregar a comunidade'}
          description={sumiu ? 'Você não faz mais parte dela, ou ela não existe.' : undefined}
          action={
            sumiu ? (
              <Button asChild variant="outline">
                <Link href="/community">Minhas comunidades</Link>
              </Button>
            ) : (
              <Button variant="outline" onClick={() => group.refetch()}>
                Tentar novamente
              </Button>
            )
          }
        />
      </div>
    );
  }

  const g = group.data;
  const equipe = (members.data ?? []).filter((m) => m.role !== 'MEMBER');
  const dono = g.role === 'OWNER';

  return (
    <div className="space-y-6 p-4">
      <section className="space-y-1">
        {g.description && <p className="text-sm">{g.description}</p>}
        <p className="text-xs text-muted-foreground">
          {`${joinPolicyLabel(g.joinPolicy)} · seu papel: ${teamRoleLabel(g.role).toLowerCase()}`}
        </p>
      </section>

      {!ativo && (
        <p className="rounded-2xl border border-subtle bg-card p-4 text-sm">
          Seu pedido está aguardando o dono aprovar. O que você escolheu compartilhar (
          {consentSummary(g.consentScopes).toLowerCase()}) passa a valer quando você entrar.
        </p>
      )}

      {g.hasAiSeat && (
        <Link
          href="/plan"
          className="flex items-center gap-3 rounded-2xl border border-subtle bg-card p-4 hover:bg-accent/40"
        >
          <Crown size={20} className="text-primary" aria-hidden />
          <span className="text-sm">
            <span className="block font-medium">A comunidade paga seu PRO</span>
            <span className="block text-xs text-muted-foreground">
              Chat, foto e ditado com a IA. Se o assento sair, você volta ao Free sem perder nada.
            </span>
          </span>
        </Link>
      )}

      {ativo && (
        <section className="space-y-2" aria-labelledby="equipe">
          <h2 id="equipe" className="text-sm font-semibold">
            Equipe
          </h2>
          {equipe.length === 0 ? (
            <p className="text-xs text-muted-foreground">Ninguém da equipe, por enquanto.</p>
          ) : (
            <ul className="divide-y rounded-2xl border border-subtle bg-card">
              {equipe.map((m) => (
                <li key={m.membershipId} className="flex justify-between px-4 py-3 text-sm">
                  <span>{m.name}</span>
                  <span className="text-xs text-muted-foreground">{teamRoleLabel(m.role)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {ativo && (
        <section className="space-y-2" aria-labelledby="compartilho">
          <h2 id="compartilho" className="text-sm font-semibold">
            O que eu compartilho
          </h2>
          <ConsentForm
            key={`${g.consentScopes.join()}|${g.statsOptIn}`}
            initial={{ scopes: g.consentScopes, statsOptIn: g.statsOptIn }}
            team={equipe}
            submitLabel="Salvar"
            editing
            pending={save.isPending}
            error={save.isError ? 'Não deu para salvar agora. Tente de novo.' : null}
            onSubmit={(consent) => save.mutate(consent)}
          />
        </section>
      )}

      {ativo && (
        <section className="space-y-2" aria-labelledby="acessos">
          <h2 id="acessos" className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck size={16} aria-hidden /> Quem acessou seus dados
          </h2>
          {log.data && log.data.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Ninguém da equipe olhou seus dados ainda.
            </p>
          )}
          {log.data && log.data.length > 0 && (
            <ul className="divide-y rounded-2xl border border-subtle bg-card text-sm">
              {log.data.map((linha, i) => (
                <li key={`${linha.at}-${i}`} className="flex justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate">
                      {linha.professionalName ?? 'Conta apagada'}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {linha.denied
                        ? `${SHARE_SCOPE_LABEL[linha.scope]} · barrado`
                        : SHARE_SCOPE_LABEL[linha.scope]}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{quando(linha.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {dono ? (
        <p className="text-xs text-muted-foreground">
          Quem é dono não sai da comunidade: transfira-a a alguém da equipe pelo painel.
        </p>
      ) : (
        <Button variant="outline" className="w-full text-danger" onClick={() => setLeaving(true)}>
          {ativo ? 'Sair da comunidade' : 'Cancelar pedido'}
        </Button>
      )}

      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title={ativo ? `Sair de ${g.name}?` : 'Cancelar o pedido?'}
        description={
          ativo
            ? `A equipe perde o acesso ao que você compartilhava${g.hasAiSeat ? ', e o PRO pago pela comunidade acaba' : ''}. Seus registros continuam com você.`
            : 'Você pode pedir de novo depois, pelo código ou por um convite.'
        }
        confirmLabel={ativo ? 'Sair' : 'Cancelar pedido'}
        pendingLabel="Saindo..."
        pending={leave.isPending}
        onConfirm={() => leave.mutate()}
      />
    </div>
  );
}
