'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, ShieldCheck, UserPlus } from 'lucide-react';
import {
  ApiError,
  OWNER_ROLE_NOTE,
  PRO_SEES_CHOICES,
  SPECIALTY_NOTE,
  STAFF_SEARCH_EMPTY,
  TEAM_SPECIALTIES,
  firstNameOf,
  groupCan,
  orgApi,
  panelHref,
  permissionCell,
  permissionColumnLabel,
  proSeesNote,
  specialtyLabel,
  staffChangeLine,
  staffGroups,
  staffLastAccessLabel,
  staffRoleWord,
  staffSubtitle,
  teamHeadline,
  teamRoleLabel,
  type GrantableRole,
  type StaffView,
  type TeamSpecialty,
} from '@fatia/api-client';
import { useOrgGroup } from '@/components/org/org-shell';
import { orgKeys } from '@/components/community/query-keys';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Chip } from '@/components/ui/selection';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return (
    (partes[0]?.[0] ?? '') + (partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
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
 * Equipe e permissões (Pn-19, #404): a equipe por papel, com busca; a pessoa
 * escolhida com papel, especialidade e quantos acompanha; a tabela "O que cada
 * papel pode fazer", vinda da mesma matriz que a API confere; e a escolha de
 * se profissionais veem só quem acompanham. Papel decide ação; dado de aluno
 * depende sempre do que ele compartilhou.
 */
export default function OrgTeamPage() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [selId, setSelId] = useState<string | null>(null);

  const pode = groupCan(g, 'member.role');
  const equipe = useQuery({
    queryKey: orgKeys.staff(g.id),
    queryFn: () => orgApi.staff(g.id),
    enabled: pode,
  });
  const tabela = useQuery({
    queryKey: orgKeys.permissions(g.id),
    queryFn: () => orgApi.permissions(g.id),
    enabled: pode,
    staleTime: Infinity,
  });

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: orgKeys.all(g.id) });
    void qc.invalidateQueries({ queryKey: orgKeys.group(g.id) });
  };

  const papel = useMutation({
    mutationFn: (v: { p: StaffView; role: GrantableRole }) =>
      orgApi.setRole(g.id, v.p.membershipId, v.role),
    onSuccess: (_r, v) => {
      toast(`${firstNameOf(v.p.name) ?? v.p.name} agora é ${staffRoleWord(v.role)}.`);
      refrescar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para mudar o papel agora.')),
  });
  const especialidade = useMutation({
    mutationFn: (v: { p: StaffView; specialty: TeamSpecialty | null }) =>
      orgApi.setSpecialty(g.id, v.p.membershipId, v.specialty),
    onSuccess: (r) => {
      toast(
        r.narrowedLinks > 0
          ? 'Especialidade salva. O que ela recebe foi recortado.'
          : 'Especialidade salva.',
      );
      refrescar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para salvar a especialidade agora.')),
  });
  const veem = useMutation({
    mutationFn: (onlyAssigned: boolean) =>
      orgApi.update(g.id, { proSeeOnlyAssigned: onlyAssigned }),
    onSuccess: () => {
      toast('Salvo.');
      refrescar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para salvar agora.')),
  });

  if (!pode) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Só o dono e o admin cuidam da equipe"
        description="Peça a quem é dono ou admin da comunidade para mudar papéis."
      />
    );
  }

  if (equipe.isPending) return <Skeleton className="h-64 rounded-2xl bg-card" />;
  if (equipe.isError || !equipe.data) {
    return (
      <EmptyState
        title="Não deu para carregar a equipe"
        action={
          <Button variant="outline" onClick={() => equipe.refetch()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  const dados = equipe.data;
  const grupos = staffGroups(dados.staff, busca);
  const sel =
    dados.staff.find((p) => p.membershipId === selId) ??
    dados.staff.find((p) => !p.isMe && p.manageable) ??
    dados.staff[0];
  const escolhas = dados.grantableRoles.filter((r) => r !== 'MEMBER');
  const souDono = g.role === 'OWNER';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-bold">Equipe e permissões</h1>
          <p className="text-sm text-muted-foreground">{teamHeadline(dados.staff.length)}</p>
        </div>
        {groupCan(g, 'invite.create') && (
          <Button asChild className="gap-1">
            <Link href={`${panelHref(g.id, 'invites')}?novo=equipe`}>
              <UserPlus size={16} aria-hidden /> Convidar para a equipe
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          <label className="relative block">
            <span className="sr-only">Buscar na equipe</span>
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, papel ou especialidade"
              className="pl-9"
            />
          </label>

          {grupos.length === 0 && (
            <p className="rounded-2xl border border-subtle bg-card p-4 text-sm text-muted-foreground">
              {STAFF_SEARCH_EMPTY}
            </p>
          )}

          {grupos.map((grupo) => (
            <section
              key={grupo.title}
              aria-label={grupo.title}
              className="overflow-hidden rounded-2xl border border-subtle bg-card"
            >
              <h2 className="flex items-center justify-between border-b border-subtle px-3 py-2 text-xs font-semibold text-muted-foreground">
                <span>{grupo.title}</span>
                <span>{grupo.people.length}</span>
              </h2>
              <ul className="divide-y divide-subtle">
                {grupo.people.map((p) => (
                  <li key={p.membershipId}>
                    <button
                      type="button"
                      aria-pressed={sel?.membershipId === p.membershipId}
                      onClick={() => setSelId(p.membershipId)}
                      className={cn(
                        'flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        sel?.membershipId === p.membershipId && 'bg-muted',
                      )}
                    >
                      <span
                        aria-hidden
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold"
                      >
                        {iniciais(p.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-sm">
                          {p.name}
                          {p.isMe ? ' (você)' : ''}
                        </b>
                        <span className="block truncate text-xs text-muted-foreground">
                          {staffSubtitle(p)}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                        {staffRoleWord(p.role)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {sel && (
          <aside
            aria-label={`Detalhes de ${sel.name}`}
            className="h-fit space-y-4 rounded-2xl border border-subtle bg-card p-4"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold"
              >
                {iniciais(sel.name)}
              </span>
              <div className="min-w-0">
                <b className="block truncate">{sel.name}</b>
                <span className="block text-xs text-muted-foreground">
                  {staffRoleWord(sel.role)}
                  {sel.specialty ? ` · ${specialtyLabel(sel.specialty)}` : ''} ·{' '}
                  {staffLastAccessLabel(sel.panelSeenAt)}
                </span>
              </div>
            </div>

            <Bloco titulo="Papel">
              {sel.role === 'OWNER' ? (
                <p className="text-sm text-muted-foreground">{OWNER_ROLE_NOTE}</p>
              ) : sel.manageable ? (
                <div className="flex flex-wrap gap-2">
                  {escolhas.map((r) => (
                    <Chip
                      key={r}
                      selected={sel.role === r}
                      disabled={papel.isPending}
                      onClick={() => sel.role !== r && papel.mutate({ p: sel, role: r })}
                    >
                      {staffRoleWord(r)}
                    </Chip>
                  ))}
                  <Chip
                    disabled={papel.isPending}
                    onClick={() => papel.mutate({ p: sel, role: 'MEMBER' })}
                  >
                    tirar da equipe
                  </Chip>
                </div>
              ) : (
                <p className="text-sm">
                  {teamRoleLabel(sel.role)}
                  <span className="block text-xs text-muted-foreground">
                    {sel.isMe
                      ? 'Seu próprio papel muda pelo dono.'
                      : 'Só o dono muda o papel de quem é admin.'}
                  </span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Mudar o papel desliga o e-mail do relatório e o resumo de risco desta pessoa.
              </p>
            </Bloco>

            {sel.role === 'PROFESSIONAL' && (
              <Bloco titulo="Especialidade">
                {sel.manageable ? (
                  <div className="flex flex-wrap gap-2">
                    {TEAM_SPECIALTIES.map((s) => (
                      <Chip
                        key={s}
                        selected={sel.specialty === s}
                        disabled={especialidade.isPending}
                        onClick={() =>
                          especialidade.mutate({
                            p: sel,
                            specialty: sel.specialty === s ? null : s,
                          })
                        }
                      >
                        {specialtyLabel(s)}
                      </Chip>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm">{specialtyLabel(sel.specialty)}</p>
                )}
                <p className="text-xs text-muted-foreground">{SPECIALTY_NOTE}</p>
              </Bloco>
            )}

            {sel.accompanies !== null && (
              <Bloco titulo="Acompanha">
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm">
                    {sel.accompanies === 1 ? '1 aluno' : `${sel.accompanies} alunos`}
                  </p>
                  {groupCan(g, 'member.assign') && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`${panelHref(g.id, 'members')}?responsavel=${sel.membershipId}`}>
                        Distribuir
                      </Link>
                    </Button>
                  )}
                </div>
              </Bloco>
            )}
          </aside>
        )}
      </div>

      <section
        aria-labelledby="permissoes"
        className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="permissoes" className="text-sm font-semibold">
            O que cada papel pode fazer
          </h2>
          <span className="text-xs text-muted-foreground">✓ pode · — não pode</span>
        </div>
        {tabela.data ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-subtle text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Ação</th>
                  {tabela.data.columns.map((c) => (
                    <th
                      key={c}
                      className={cn(
                        'px-2 py-2 text-center font-semibold',
                        sel?.role === c && 'text-primary',
                      )}
                    >
                      {permissionColumnLabel(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {tabela.data.rows.map((r) => (
                  <tr key={r.key}>
                    <td className="py-2 pr-3">{r.label}</td>
                    {tabela.data.columns.map((c) => {
                      const v = permissionCell(c, r.roles);
                      return (
                        <td
                          key={c}
                          className={cn(
                            'px-2 py-2 text-center',
                            v === '✓' ? 'text-foreground' : 'text-muted-foreground',
                            sel?.role === c && 'bg-primary/10',
                          )}
                        >
                          <span aria-label={v === '✓' ? 'pode' : 'não pode'}>{v}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Skeleton className="h-40 rounded-xl" />
        )}
        <p className="text-xs text-muted-foreground">
          Ver dado de aluno nunca vem do papel: vem do que cada aluno escolheu compartilhar com a
          comunidade. Admin e recepção não recebem.
        </p>
      </section>

      <section
        aria-labelledby="veem"
        className="space-y-2 rounded-2xl border border-subtle bg-card p-4"
      >
        <h2 id="veem" className="text-sm font-semibold">
          Profissionais veem
        </h2>
        <div role="group" aria-label="Profissionais veem" className="flex flex-wrap gap-2">
          {PRO_SEES_CHOICES.map((c) => (
            <Chip
              key={c.label}
              selected={dados.proSeeOnlyAssigned === c.value}
              disabled={veem.isPending || !groupCan(g, 'group.update')}
              onClick={() => dados.proSeeOnlyAssigned !== c.value && veem.mutate(c.value)}
            >
              {c.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{proSeesNote(dados.proSeeOnlyAssigned)}</p>
      </section>

      {souDono && dados.history && (
        <section
          aria-labelledby="historico"
          className="space-y-2 rounded-2xl border border-subtle bg-card p-4"
        >
          <h2 id="historico" className="text-sm font-semibold">
            Histórico da equipe
          </h2>
          {dados.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma mudança ainda.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {dados.history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex flex-wrap justify-between gap-2">
                  <span>{staffChangeLine(h)}</span>
                  <time dateTime={h.at} className="text-xs text-muted-foreground">
                    {new Date(h.at).toLocaleDateString('pt-BR')}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
