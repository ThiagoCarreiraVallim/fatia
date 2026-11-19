'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageCircle } from 'lucide-react';
import {
  ApiError,
  accompanyOptions,
  hasFreeSeat,
  joinedViaLabel,
  orgApi,
  panelHref,
  seatsApi,
  shortPanelDate,
  teamRoleLabel,
  whatsappChatHref,
  type GrantableRole,
  type MyGroup,
  type PanelMember,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { ScopeChips } from '@/components/sharing/scope-chips';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Switch } from '@/components/ui/switch';
import { usePanelMembers } from './use-panel-members';

const PAPEIS: GrantableRole[] = ['MEMBER', 'PROFESSIONAL', 'CREATOR'];

const STATUS: Record<PanelMember['status'], string> = {
  ACTIVE: 'Ativo',
  INVITED: 'Aguardando',
  LEFT: 'Saiu',
  REMOVED: 'Removido',
  BANNED: 'Bloqueado',
};

export function memberStatusLabel(m: PanelMember): string {
  return STATUS[m.status];
}

/** "desde 2 out", "saiu em 2 nov" ou "pediu para entrar". */
export function memberSinceLabel(m: PanelMember): string {
  if (m.status === 'INVITED') return 'pediu para entrar';
  if (m.leftAt) return `saiu em ${shortPanelDate(m.leftAt)}`;
  return m.joinedAt ? `desde ${shortPanelDate(m.joinedAt)}` : '';
}

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/**
 * A pessoa no painel lateral (Pn-04b): WhatsApp que ela autorizou, quem
 * acompanha, assento, papel, o que compartilha e remover. Cada mudança vale na
 * hora; o dono muda, o profissional só lê.
 */
export function MemberPanel({
  group: g,
  membershipId,
  onClose,
}: {
  group: MyGroup;
  membershipId: string;
  onClose: () => void;
}) {
  const dono = g.role === 'OWNER';
  const qc = useQueryClient();
  const membros = usePanelMembers(g.id);
  const assentos = useQuery({
    queryKey: orgKeys.seats(g.id),
    queryFn: () => seatsApi.get(g.id),
    enabled: dono,
  });
  const [removendo, setRemovendo] = useState(false);
  const m = membros.data?.find((x) => x.membershipId === membershipId);

  const refrescar = () => void qc.invalidateQueries({ queryKey: orgKeys.all(g.id) });
  const falhou = (padrao: string) => (err: unknown) => toast(erroDaApi(err, padrao));

  const acompanhar = useMutation({
    mutationFn: (id: string | null) => orgApi.setAccompaniedBy(g.id, membershipId, id),
    onSuccess: () => {
      toast('Acompanhamento atualizado.');
      refrescar();
    },
    onError: falhou('Não deu para trocar quem acompanha agora.'),
  });
  const assento = useMutation({
    mutationFn: (dar: boolean) =>
      dar ? seatsApi.assign(g.id, membershipId) : seatsApi.unassign(g.id, membershipId),
    onSuccess: (_r, dar) => {
      toast(dar ? 'Assento PRO dado.' : 'Assento PRO liberado.');
      refrescar();
    },
    onError: falhou('Não deu para mudar o assento agora.'),
  });
  const papel = useMutation({
    mutationFn: (role: GrantableRole) => orgApi.setRole(g.id, membershipId, role),
    onSuccess: (_r, role) => {
      toast(`Agora é ${teamRoleLabel(role).toLowerCase()}.`);
      refrescar();
    },
    onError: falhou('Não deu para mudar o papel agora.'),
  });
  const aprovar = useMutation({
    mutationFn: () => orgApi.approve(g.id, membershipId, 'MEMBER'),
    onSuccess: () => {
      toast(`${m?.name ?? 'A pessoa'} entrou na comunidade.`);
      refrescar();
    },
    onError: falhou('Não deu para aprovar agora.'),
  });
  const remover = useMutation({
    mutationFn: () => orgApi.removeMember(g.id, membershipId),
    onSuccess: () => {
      toast(
        m?.status === 'INVITED'
          ? 'Pedido recusado.'
          : `${m?.name ?? 'A pessoa'} saiu da comunidade.`,
      );
      setRemovendo(false);
      refrescar();
      onClose();
    },
    onError: falhou('Não deu para remover agora.'),
  });

  if (!m) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        {membros.isPending ? 'Carregando...' : 'Esta pessoa não está mais na lista.'}
      </p>
    );
  }

  const ativo = m.status === 'ACTIVE';
  const pendente = m.status === 'INVITED';
  const ehDono = m.role === 'OWNER';
  const ehMembro = m.role === 'MEMBER';
  const zap = m.whatsapp ? whatsappChatHref(m.whatsapp) : null;
  const via = joinedViaLabel(m);
  const vaga = assentos.data ? hasFreeSeat(assentos.data) : false;
  const compartilha = (m.scopesGrantedToMe?.length ?? 0) > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {[memberSinceLabel(m), via !== '—' ? `entrou por ${via.toLowerCase()}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="text-sm">
            {teamRoleLabel(m.role)} · {memberStatusLabel(m)}
          </p>
        </div>

        {zap && m.whatsapp && (
          <a
            href={zap}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center gap-3 rounded-xl bg-muted/50 p-3 hover:bg-muted"
          >
            <MessageCircle size={18} aria-hidden className="shrink-0 text-primary" />
            <span className="min-w-0">
              <b className="block text-sm">{m.whatsapp}</b>
              <span className="block text-xs text-muted-foreground">
                abrir a conversa no WhatsApp · a pessoa autorizou mostrar à equipe
              </span>
            </span>
          </a>
        )}

        {pendente && dono && (
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={aprovar.isPending}
              onClick={() => aprovar.mutate()}
            >
              Aprovar
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setRemovendo(true)}>
              Recusar
            </Button>
          </div>
        )}

        {ativo && compartilha && (
          <Button variant="outline" asChild className="w-full">
            <Link href={`${panelHref(g.id, 'members')}/${m.membershipId}`}>Ficha completa</Link>
          </Button>
        )}

        {ativo && ehMembro && (
          <Bloco titulo="Acompanhada por">
            {dono ? (
              <div className="flex flex-wrap gap-2">
                {accompanyOptions(membros.data ?? []).map((p) => (
                  <Chip
                    key={p.membershipId}
                    selected={m.accompaniedBy?.membershipId === p.membershipId}
                    disabled={acompanhar.isPending}
                    onClick={() => acompanhar.mutate(p.membershipId)}
                  >
                    {p.name}
                  </Chip>
                ))}
                <Chip
                  selected={!m.accompaniedBy}
                  disabled={acompanhar.isPending}
                  onClick={() => acompanhar.mutate(null)}
                >
                  Ninguém
                </Chip>
              </div>
            ) : (
              <p className="text-sm">{m.accompaniedBy?.name ?? 'Ninguém'}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Quem acompanha recebe a pessoa na lista dela. O que cada um vê continua sendo o que a
              pessoa autoriza.
            </p>
          </Bloco>
        )}

        {ativo && !ehDono && dono && (
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Assento PRO</p>
              <p className="text-xs text-muted-foreground">
                {m.hasAiSeat
                  ? 'Usa 1 assento · PRO pela comunidade.'
                  : vaga
                    ? 'Sem assento. Dá para liberar agora.'
                    : 'Sem assentos livres. Compre mais em Assentos e faturas.'}
              </p>
            </div>
            <Switch
              label="Assento PRO"
              checked={Boolean(m.hasAiSeat)}
              disabled={assento.isPending || (!m.hasAiSeat && !vaga)}
              onCheckedChange={(dar) => assento.mutate(dar)}
            />
          </div>
        )}

        {ativo && !ehDono && dono && (
          <Bloco titulo="Papel">
            <div className="flex flex-wrap gap-2">
              {PAPEIS.map((r) => (
                <Chip
                  key={r}
                  selected={m.role === r}
                  disabled={papel.isPending}
                  onClick={() => m.role !== r && papel.mutate(r)}
                >
                  {teamRoleLabel(r)}
                </Chip>
              ))}
            </div>
          </Bloco>
        )}

        {ativo && !ehDono && (
          <Bloco titulo="O que compartilha com você">
            <ScopeChips granted={m.scopesGrantedToMe ?? []} />
            <p className="text-xs text-muted-foreground">
              Só a pessoa muda isso, no app. Cada vez que alguém da equipe abre os dados, fica no
              histórico de acesso dela.
            </p>
          </Bloco>
        )}
      </div>

      {ativo && !ehDono && dono && (
        <div className="shrink-0 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="ghost" className="w-full text-danger" onClick={() => setRemovendo(true)}>
            Remover da comunidade
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={removendo}
        onOpenChange={setRemovendo}
        title={pendente ? `Recusar o pedido de ${m.name}?` : `Remover ${m.name}?`}
        description={
          pendente
            ? 'A pessoa pode pedir de novo depois, pelo código ou por um convite.'
            : `A equipe perde o acesso ao que essa pessoa compartilhava${m.hasAiSeat ? ', e o assento PRO volta para a comunidade' : ''}. Os registros dela continuam com ela.`
        }
        confirmLabel={pendente ? 'Recusar' : 'Remover'}
        pendingLabel={pendente ? 'Recusando...' : 'Removendo...'}
        pending={remover.isPending}
        onConfirm={() => remover.mutate()}
      />
    </div>
  );
}
