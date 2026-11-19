'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChevronRight, Crown, Gift, LayoutDashboard, Lock, Search } from 'lucide-react';
import {
  accessLogLine,
  ApiError,
  benefitsApi,
  canOpenPanel,
  consentSummary,
  entryPolicyView,
  groupsApi,
  LEAVE_COPY,
  lockedScopes,
  myRoleBadge,
  panelHref,
  PRO_PAID_NOTE,
  SCOPE_DETAILS,
  SHARE_SCOPE_LABEL,
  SHARE_SCOPES,
  teamRoleLabel,
  teamSections,
  teamWhoSeesCount,
  timezoneLabel,
  toggleScope,
  viewedToday,
  VISIBILITY_WORD,
  type JoinConsent,
  type MyGroup,
  type ShareScope,
} from '@fatia/api-client';
import { GroupAvatar } from '@/components/community/group-avatar';
import { communityKeys } from '@/components/community/query-keys';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/** Quantos da equipe aparecem antes do "Ver toda a equipe". */
const TEAM_PREVIEW = 3;
const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** "O que eu compartilho" (Cm-04): uma chave por categoria, que grava na hora. */
function SharingSection({ g }: { g: MyGroup }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (consent: JoinConsent) => groupsApi.setConsent(g.id, consent),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      toast(`Compartilhando: ${consentSummary(r.scopes)}.`);
    },
  });
  // 409: tirar um obrigatório que já compartilha; a API diz qual.
  const saveError = save.isError
    ? save.error instanceof ApiError && save.error.isConflict
      ? save.error.message
      : 'Não deu para salvar agora. Tente de novo.'
    : null;
  // A exigência é de quem participa como membro; a equipe recebe.
  const locked = lockedScopes(g.role === 'MEMBER' ? g.requiredSharingScopes : [], g.consentScopes);
  const flip = (scope: ShareScope) =>
    save.mutate({ scopes: toggleScope(g.consentScopes, scope), statsOptIn: g.statsOptIn });

  return (
    <section className="space-y-2.5" aria-labelledby="compartilho">
      <div className="space-y-1 px-1">
        <h2 id="compartilho" className="eyebrow">
          O que eu compartilho
        </h2>
        <p className="text-xs text-muted-foreground">
          A equipe da comunidade vê só o que estiver ligado aqui.
        </p>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-card bg-card">
        {SHARE_SCOPES.map((scope) => {
          const on = g.consentScopes.includes(scope);
          const lock = locked.includes(scope);
          return (
            <li key={scope} className="flex min-h-16 items-center gap-3 px-[18px] py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{SHARE_SCOPE_LABEL[scope]}</span>
                <span className="block text-xs text-muted-foreground">
                  {lock ? `${SCOPE_DETAILS[scope]} · obrigatório aqui` : SCOPE_DETAILS[scope]}
                </span>
              </span>
              {lock && <Lock size={16} className="text-muted-foreground" aria-hidden />}
              <Switch
                checked={on}
                label={SHARE_SCOPE_LABEL[scope]}
                disabled={lock || save.isPending}
                onCheckedChange={() => flip(scope)}
              />
            </li>
          );
        })}
      </ul>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 px-1">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={g.statsOptIn}
          disabled={save.isPending}
          onChange={(e) => save.mutate({ scopes: g.consentScopes, statsOptIn: e.target.checked })}
        />
        <span
          aria-hidden
          className={cn(
            'flex size-6 items-center justify-center rounded-md border border-border peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
            g.statsOptIn && 'border-primary bg-primary text-primary-foreground',
          )}
        >
          {g.statsOptIn && <Check size={16} />}
        </span>
        <span className="text-sm">Entrar nos números da comunidade (sem nome)</span>
      </label>
      {saveError && (
        <p role="alert" className="px-1 text-sm text-danger">
          {saveError}
        </p>
      )}
    </section>
  );
}

/** "Equipe da comunidade": quem vê o quê de mim, com busca e "viu hoje". */
function TeamSection({ groupId }: { groupId: string }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const team = useQuery({
    queryKey: communityKeys.team(groupId),
    queryFn: () => groupsApi.team(groupId),
  });
  const now = useMemo(() => new Date(), []);
  if (!team.data) return team.isPending ? <Skeleton className="h-40 rounded-card bg-card" /> : null;

  const termo = q.trim().toLowerCase();
  const filtrada = termo
    ? team.data.filter((m) => `${m.name} ${teamRoleLabel(m.role)}`.toLowerCase().includes(termo))
    : team.data;
  const secoes = teamSections(filtrada);
  const limite = all || termo ? Infinity : TEAM_PREVIEW;
  const visiveis: Array<(typeof secoes)[number] & { total: number }> = [];
  let mostrados = 0;
  for (const s of secoes) {
    const members = s.members.slice(0, Math.max(0, limite - mostrados));
    mostrados += members.length;
    if (members.length > 0) visiveis.push({ ...s, total: s.members.length, members });
  }
  const veem = teamWhoSeesCount(team.data);

  return (
    <section className="space-y-2.5" aria-labelledby="equipe">
      <div className="space-y-1 px-1">
        <h2 id="equipe" className="eyebrow">
          Equipe da comunidade
        </h2>
        <p className="text-xs text-muted-foreground">
          {veem === 0
            ? 'Ninguém da equipe vê o que você compartilha agora.'
            : `${veem} ${veem === 1 ? 'pessoa pode' : 'pessoas podem'} ver o que você compartilha.`}
        </p>
      </div>
      {team.data.length > TEAM_PREVIEW && (
        <label className="flex h-12 items-center gap-2 rounded-[14px] bg-card px-3.5">
          <Search size={16} className="text-muted-foreground" aria-hidden />
          <input
            aria-label="Buscar na equipe"
            placeholder="Buscar por nome ou função"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
      )}
      {visiveis.map((s) => (
        <div key={s.title} className="space-y-2">
          <div className="flex justify-between px-1 pt-1 text-xs">
            <span className="font-bold text-muted-foreground">{s.title}</span>
            <span className="tabular-nums text-muted-foreground">{s.total}</span>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-card bg-card">
            {s.members.map((m) => (
              <li
                key={`${m.role}-${m.name}`}
                className="flex min-h-[60px] items-center gap-3 px-[18px] py-3"
              >
                <GroupAvatar name={m.name} url={null} size={36} className="rounded-full" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{m.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {m.sees.length > 0
                      ? `${teamRoleLabel(m.role).toLowerCase()} · vê ${consentSummary(m.sees).toLowerCase()}`
                      : `${teamRoleLabel(m.role).toLowerCase()} · não vê seus dados`}
                  </span>
                </span>
                {viewedToday(m.lastViewedAt, now, BROWSER_TZ) && (
                  <Badge variant="pending">viu hoje</Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {termo && visiveis.length === 0 && (
        <p className="px-1 text-xs text-muted-foreground">Ninguém da equipe com esse nome.</p>
      )}
      {!all && !termo && team.data.length > TEAM_PREVIEW && (
        <Button size="sm" variant="outline" className="w-full" onClick={() => setAll(true)}>
          {`Ver toda a equipe (${team.data.length})`}
        </Button>
      )}
    </section>
  );
}

/**
 * Sobre a comunidade (Cm-04), atrás da engrenagem do mural: quem é, o PRO pago
 * pela comunidade, os benefícios, o que eu compartilho (cada categoria grava
 * na hora; a obrigatória fica travada), quem da equipe vê, quem olhou meus
 * dados (inclusive o negado) e sair, com confirmação.
 */
export default function CommunitySettingsPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [leaving, setLeaving] = useState(false);
  const now = useMemo(() => new Date(), []);

  const group = useQuery({
    queryKey: communityKeys.group(groupId),
    queryFn: () => groupsApi.get(groupId),
  });
  const active = group.data?.status === 'ACTIVE';
  const log = useQuery({
    queryKey: communityKeys.accessLog(groupId),
    queryFn: () => groupsApi.accessLog({ groupId, limit: 5 }),
    enabled: active,
  });
  const benefits = useQuery({
    queryKey: communityKeys.benefits(groupId),
    queryFn: () => benefitsApi.list(groupId),
    enabled: active,
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
    const notFound = group.error instanceof ApiError && group.error.isNotFound;
    return (
      <div className="p-4">
        <EmptyState
          title={notFound ? 'Comunidade não encontrada' : 'Não deu para carregar a comunidade'}
          description={notFound ? 'Você não faz mais parte dela, ou ela não existe.' : undefined}
          action={
            notFound ? (
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
  const isOwner = g.role === 'OWNER';
  const entry = entryPolicyView(g.joinPolicy);
  const ativos = (benefits.data ?? []).filter((b) => !b.expired).length;

  return (
    <div className="space-y-5 p-4">
      <section className="flex items-start gap-3">
        <GroupAvatar
          name={g.name}
          url={g.avatarUrl}
          size={56}
          className={cn(
            'rounded-[18px]',
            g.type === 'SPONSORED' && 'bg-brand text-brand-foreground',
          )}
        />
        <div className="min-w-0 flex-1 space-y-1">
          {/* A barra diz "Sobre a comunidade"; o nome fica aqui. */}
          <h2 className="font-display text-h3 font-bold">{g.name}</h2>
          <p className="text-xs text-muted-foreground">
            {[g.description, timezoneLabel(g.timezone)].filter(Boolean).join(' · ')}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Badge variant="pending">{VISIBILITY_WORD[g.visibility]}</Badge>
            <Badge
              variant={entry.tone === 'ok' ? 'done' : entry.tone === 'warn' ? 'lite' : 'pending'}
            >
              {entry.badge}
            </Badge>
            <Badge variant="pending">{myRoleBadge(g.role)}</Badge>
          </div>
        </div>
      </section>

      {canOpenPanel(g) && (
        <Link
          href={panelHref(g.id)}
          className="flex min-h-14 items-center gap-3 rounded-[18px] bg-card px-4 hover:bg-accent/40"
        >
          <LayoutDashboard size={18} className="text-primary" aria-hidden />
          <span className="flex-1 text-sm font-semibold">Abrir painel</span>
          <ChevronRight size={16} className="text-muted-foreground" aria-hidden />
        </Link>
      )}

      {!active && (
        <p className="rounded-2xl border border-subtle bg-card p-4 text-sm">
          Seu pedido está aguardando o dono aprovar. O que você escolheu compartilhar (
          {consentSummary(g.consentScopes).toLowerCase()}) passa a valer quando você entrar.
        </p>
      )}

      {g.proPaidByThisGroup && (
        <Link
          href="/plan"
          className="flex items-center gap-3 rounded-2xl bg-primary/10 px-4 py-3.5 text-sm"
        >
          <Crown size={16} className="shrink-0 text-primary" aria-hidden />
          {PRO_PAID_NOTE}
        </Link>
      )}

      {/* Sem benefício valendo, a entrada some (Pn-28b). */}
      {ativos > 0 && (
        <Link
          href={`/community/${g.id}/benefits`}
          className="flex min-h-14 items-center gap-3 rounded-[18px] bg-card px-4 hover:bg-accent/40"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand text-brand-foreground">
            <Gift size={16} aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold">Benefícios</span>
            <span className="block text-xs text-muted-foreground">
              {`${ativos} ${ativos === 1 ? 'desconto' : 'descontos'} de parceiros`}
            </span>
          </span>
          <ChevronRight size={16} className="text-muted-foreground" aria-hidden />
        </Link>
      )}

      {active && <SharingSection g={g} />}
      {active && <TeamSection groupId={g.id} />}

      {active && (
        <section
          aria-labelledby="acessos"
          className="space-y-2 rounded-card bg-surface-3 px-[18px] py-4"
        >
          <h2 id="acessos" className="eyebrow">
            Quem olhou seus dados
          </h2>
          {log.data && log.data.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Ninguém da equipe olhou seus dados ainda.
            </p>
          )}
          {log.data?.map((entry, i) => (
            <p
              key={`${entry.at}-${i}`}
              className={entry.denied ? 'text-xs text-muted-foreground' : 'text-sm'}
            >
              {accessLogLine(entry, now, BROWSER_TZ)}
            </p>
          ))}
        </section>
      )}

      {isOwner ? (
        <p className="text-xs text-muted-foreground">
          Quem é dono não sai da comunidade: transfira-a pelo painel, em Configurações.
        </p>
      ) : (
        <Button variant="outline" className="w-full text-danger" onClick={() => setLeaving(true)}>
          {active ? 'Sair da comunidade' : 'Cancelar pedido'}
        </Button>
      )}

      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title={active ? `Sair da ${g.name}?` : 'Cancelar o pedido?'}
        description={
          active
            ? g.proPaidByThisGroup
              ? LEAVE_COPY.bodyPro
              : LEAVE_COPY.body
            : 'Você pode pedir de novo depois, pelo código ou por um convite.'
        }
        confirmLabel={active ? 'Sair' : 'Cancelar pedido'}
        pendingLabel="Saindo..."
        pending={leave.isPending}
        onConfirm={() => leave.mutate()}
      />
    </div>
  );
}
