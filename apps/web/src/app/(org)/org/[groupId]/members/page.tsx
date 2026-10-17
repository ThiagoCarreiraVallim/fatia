'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronRight, Crown, Search, Users } from 'lucide-react';
import {
  ApiError,
  filterMembers,
  hasFreeSeat,
  orgApi,
  panelHref,
  seatsApi,
  teamRoleLabel,
  type GrantableRole,
  type MemberFilter,
  type PanelMember,
} from '@fatia/api-client';
import { useOrgGroup } from '@/components/org/org-shell';
import { orgKeys } from '@/components/community/query-keys';
import { ScopeChips } from '@/components/sharing/scope-chips';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const FILTROS: { value: MemberFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Aguardando' },
  { value: 'team', label: 'Equipe' },
];

const PAPEIS: GrantableRole[] = ['MEMBER', 'PROFESSIONAL', 'CREATOR'];

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

/**
 * Membros da comunidade, para a equipe. O dono aprova, muda papel, remove e
 * dá assento; o profissional vê a lista, o que cada um compartilha com ele e
 * abre a leitura individual.
 */
export default function OrgMembersPage() {
  const g = useOrgGroup();
  const dono = g.role === 'OWNER';
  const qc = useQueryClient();
  const inicial = useSearchParams().get('filtro');
  const [filtro, setFiltro] = useState<MemberFilter>(
    inicial === 'pending' || inicial === 'team' ? inicial : 'all',
  );
  const [busca, setBusca] = useState('');
  const [removendo, setRemovendo] = useState<PanelMember | null>(null);

  const membros = useQuery({
    queryKey: orgKeys.members(g.id),
    queryFn: () => orgApi.members(g.id),
  });
  const assentos = useQuery({
    queryKey: orgKeys.seats(g.id),
    queryFn: () => seatsApi.get(g.id),
    enabled: dono,
  });

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: orgKeys.all(g.id) });
  };
  const falhou = (padrao: string) => (err: unknown) => toast(erroDaApi(err, padrao));

  const aprovar = useMutation({
    mutationFn: ({ m, role }: { m: PanelMember; role: GrantableRole }) =>
      orgApi.approve(g.id, m.membershipId, role),
    onSuccess: (_r, { m }) => {
      toast(`${m.name} entrou na comunidade.`);
      refrescar();
    },
    onError: falhou('Não deu para aprovar agora.'),
  });
  const papel = useMutation({
    mutationFn: ({ m, role }: { m: PanelMember; role: GrantableRole }) =>
      orgApi.setRole(g.id, m.membershipId, role),
    onSuccess: (_r, { m, role }) => {
      toast(`${m.name} agora é ${teamRoleLabel(role).toLowerCase()}.`);
      refrescar();
    },
    onError: falhou('Não deu para mudar o papel agora.'),
  });
  const remover = useMutation({
    mutationFn: (m: PanelMember) => orgApi.removeMember(g.id, m.membershipId),
    onSuccess: (_r, m) => {
      toast(m.status === 'INVITED' ? 'Pedido recusado.' : `${m.name} saiu da comunidade.`);
      setRemovendo(null);
      refrescar();
    },
    onError: falhou('Não deu para remover agora.'),
  });
  const assento = useMutation({
    mutationFn: ({ m, dar }: { m: PanelMember; dar: boolean }) =>
      dar ? seatsApi.assign(g.id, m.membershipId) : seatsApi.unassign(g.id, m.membershipId),
    onSuccess: (_r, { m, dar }) => {
      toast(dar ? `${m.name} ganhou um assento PRO.` : `O assento de ${m.name} foi liberado.`);
      refrescar();
    },
    onError: falhou('Não deu para mudar o assento agora.'),
  });

  const lista = filterMembers(membros.data ?? [], filtro, busca);
  const vaga = assentos.data ? hasFreeSeat(assentos.data) : false;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="group" aria-label="Filtrar membros" className="flex gap-1">
          {FILTROS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filtro === f.value}
              onClick={() => setFiltro(f.value)}
              className={cn(
                'min-h-11 rounded-full px-4 text-sm font-semibold',
                filtro === f.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="relative flex-1">
          <span className="sr-only">Buscar por nome</span>
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome"
            className="pl-9"
          />
        </label>
      </div>

      {membros.isPending && <Skeleton className="h-48 rounded-2xl bg-card" />}
      {membros.isError && (
        <EmptyState
          title="Não deu para carregar os membros"
          action={
            <Button variant="outline" onClick={() => membros.refetch()}>
              Tentar novamente
            </Button>
          }
        />
      )}
      {membros.data && lista.length === 0 && (
        <EmptyState
          icon={Users}
          title={filtro === 'pending' ? 'Nenhum pedido aguardando' : 'Ninguém por aqui'}
          description={
            filtro === 'all' && !busca ? 'Convide pessoas pela seção Convites.' : undefined
          }
        />
      )}

      {lista.length > 0 && (
        <ul className="divide-y divide-subtle rounded-2xl border border-subtle bg-card">
          {lista.map((m) => {
            const pendente = m.status === 'INVITED';
            const ehDono = m.role === 'OWNER';
            const leitura = !pendente && (m.scopesGrantedToMe?.length ?? 0) > 0;
            return (
              <li
                key={m.membershipId}
                className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {m.name}
                    {pendente && <Badge variant="outline">Aguardando</Badge>}
                    {m.hasAiSeat && (
                      <Badge variant="secondary" className="gap-1">
                        <Crown size={12} aria-hidden /> PRO
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{teamRoleLabel(m.role)}</p>
                  {!pendente && !ehDono && <ScopeChips granted={m.scopesGrantedToMe ?? []} />}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {pendente && dono && (
                    <>
                      <Button
                        size="sm"
                        disabled={aprovar.isPending}
                        onClick={() => aprovar.mutate({ m, role: 'MEMBER' })}
                      >
                        Aprovar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRemovendo(m)}>
                        Recusar
                      </Button>
                    </>
                  )}

                  {!pendente && !ehDono && dono && (
                    <>
                      <Select
                        value={m.role}
                        onValueChange={(role) => papel.mutate({ m, role: role as GrantableRole })}
                      >
                        <SelectTrigger className="h-11 w-44" aria-label={`Papel de ${m.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAPEIS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {teamRoleLabel(r)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {m.hasAiSeat ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => assento.mutate({ m, dar: false })}
                        >
                          Tirar assento
                        </Button>
                      ) : (
                        vaga && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => assento.mutate({ m, dar: true })}
                          >
                            Dar assento
                          </Button>
                        )
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger"
                        onClick={() => setRemovendo(m)}
                      >
                        Remover
                      </Button>
                    </>
                  )}

                  {leitura && (
                    <Link
                      href={`${panelHref(g.id, 'members')}/${m.membershipId}`}
                      className="flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-muted"
                    >
                      Ver dados <ChevronRight size={16} aria-hidden />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={removendo !== null}
        onOpenChange={(open) => !open && setRemovendo(null)}
        title={
          removendo?.status === 'INVITED'
            ? `Recusar o pedido de ${removendo.name}?`
            : `Remover ${removendo?.name ?? ''}?`
        }
        description={
          removendo?.status === 'INVITED'
            ? 'A pessoa pode pedir de novo depois, pelo código ou por um convite.'
            : `A equipe perde o acesso ao que essa pessoa compartilhava${removendo?.hasAiSeat ? ', e o assento PRO volta para a comunidade' : ''}. Os registros dela continuam com ela.`
        }
        confirmLabel={removendo?.status === 'INVITED' ? 'Recusar' : 'Remover'}
        pendingLabel={removendo?.status === 'INVITED' ? 'Recusando...' : 'Removendo...'}
        pending={remover.isPending}
        onConfirm={() => removendo && remover.mutate(removendo)}
      />
    </div>
  );
}
