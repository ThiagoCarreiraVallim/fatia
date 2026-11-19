import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Crown, Gift, LayoutDashboard, Lock, Search } from 'lucide-react-native';
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
  myNotesApi,
  myRoleBadge,
  panelHref,
  PRO_PAID_NOTE,
  relativeStamp,
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
import { Screen } from '@/components/layout/screen';
import { apiMessage } from '@/components/org/org-panel';
import {
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Switch,
  cn,
  useConfirm,
} from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { colors } from '@/theme/colors';

const TEAM_PREVIEW = 3;
const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const STATS_LABEL = 'Entrar nos números da comunidade (sem nome)';

function Eyebrow({ children }: { children: string }) {
  return (
    <Text
      accessibilityRole="header"
      className="px-1 font-sans-bold text-xs uppercase tracking-[0.72px] text-faint"
    >
      {children}
    </Text>
  );
}

/** "O que eu compartilho" (Cm-04): uma chave por categoria, que grava na hora. */
function SharingSection({ g }: { g: MyGroup }) {
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: (consent: JoinConsent) => groupsApi.setConsent(g.id, consent),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      toast.show({ message: `Compartilhando: ${consentSummary(r.scopes)}.` });
    },
  });
  // A exigência é de quem participa como membro; a equipe recebe.
  const locked = lockedScopes(g.role === 'MEMBER' ? g.requiredSharingScopes : [], g.consentScopes);
  const flip = (scope: ShareScope) => {
    if (save.isPending) return;
    save.mutate({ scopes: toggleScope(g.consentScopes, scope), statsOptIn: g.statsOptIn });
  };

  return (
    <View className="gap-2.5">
      <View className="gap-1">
        <Eyebrow>O que eu compartilho</Eyebrow>
        <Text className="px-1 text-xs text-muted-foreground">
          A equipe da comunidade vê só o que estiver ligado aqui.
        </Text>
      </View>
      <View className="overflow-hidden rounded-card bg-card">
        {SHARE_SCOPES.map((scope, i) => {
          const lock = locked.includes(scope);
          return (
            <View
              key={scope}
              className={cn(
                'min-h-16 flex-row items-center gap-3 px-[18px] py-3',
                i > 0 && 'border-t border-border',
              )}
            >
              <View className="min-w-0 flex-1">
                <Text className="font-sans-bold text-sm text-foreground">
                  {SHARE_SCOPE_LABEL[scope]}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {lock ? `${SCOPE_DETAILS[scope]} · obrigatório aqui` : SCOPE_DETAILS[scope]}
                </Text>
              </View>
              {lock ? (
                <View accessibilityLabel={`${SHARE_SCOPE_LABEL[scope]}: obrigatório, ligado`}>
                  <Lock size={18} color={colors.mutedForeground} />
                </View>
              ) : (
                <Switch
                  checked={g.consentScopes.includes(scope)}
                  label={SHARE_SCOPE_LABEL[scope]}
                  onCheckedChange={() => flip(scope)}
                />
              )}
            </View>
          );
        })}
      </View>
      {/* O `label` do Checkbox é só para o leitor de tela: o texto visível vem ao lado. */}
      <View className="flex-row items-center gap-3 px-1">
        <Checkbox
          checked={g.statsOptIn}
          label={STATS_LABEL}
          onCheckedChange={(v) =>
            !save.isPending && save.mutate({ scopes: g.consentScopes, statsOptIn: v })
          }
        />
        <Text
          className="flex-1 text-sm text-foreground"
          onPress={() =>
            !save.isPending && save.mutate({ scopes: g.consentScopes, statsOptIn: !g.statsOptIn })
          }
        >
          {STATS_LABEL}
        </Text>
      </View>
      {save.isError ? (
        <Text accessibilityRole="alert" className="px-1 text-sm text-danger">
          {apiMessage(save.error, 'Não deu para salvar agora. Tente de novo.')}
        </Text>
      ) : null}
    </View>
  );
}

/** "Equipe da comunidade": quem vê o quê de mim, com busca e "viu hoje". */
function TeamSection({ groupId }: { groupId: string }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const team = useQuery({
    queryKey: ['community', 'team', groupId],
    queryFn: () => groupsApi.team(groupId),
  });
  const now = useMemo(() => new Date(), []);
  if (!team.data) return team.isPending ? <LoadingState label="Carregando a equipe…" /> : null;

  const termo = q.trim().toLowerCase();
  const filtrada = termo
    ? team.data.filter((m) => `${m.name} ${teamRoleLabel(m.role)}`.toLowerCase().includes(termo))
    : team.data;
  const limite = all || termo ? Infinity : TEAM_PREVIEW;
  const visiveis = [];
  let mostrados = 0;
  for (const s of teamSections(filtrada)) {
    const members = s.members.slice(0, Math.max(0, limite - mostrados));
    mostrados += members.length;
    if (members.length > 0) visiveis.push({ ...s, total: s.members.length, members });
  }
  const veem = teamWhoSeesCount(team.data);

  return (
    <View className="gap-2.5">
      <View className="gap-1">
        <Eyebrow>Equipe da comunidade</Eyebrow>
        <Text className="px-1 text-xs text-muted-foreground">
          {veem === 0
            ? 'Ninguém da equipe vê o que você compartilha agora.'
            : `${veem} ${veem === 1 ? 'pessoa pode' : 'pessoas podem'} ver o que você compartilha.`}
        </Text>
      </View>
      {team.data.length > TEAM_PREVIEW ? (
        <View className="h-12 flex-row items-center gap-2 rounded-[14px] bg-card px-3.5">
          <Search size={16} color={colors.mutedForeground} />
          <Input
            accessibilityLabel="Buscar na equipe"
            placeholder="Buscar por nome ou função"
            value={q}
            onChangeText={setQ}
            className="h-full flex-1 border-0 bg-transparent px-0"
          />
        </View>
      ) : null}
      {visiveis.map((s) => (
        <View key={s.title} className="gap-2">
          <View className="flex-row justify-between px-1 pt-1">
            <Text className="font-sans-bold text-xs text-muted-foreground">{s.title}</Text>
            <Text className="text-xs text-muted-foreground">{String(s.total)}</Text>
          </View>
          <View className="overflow-hidden rounded-card bg-card">
            {s.members.map((m, i) => (
              <View
                key={`${m.role}-${m.name}`}
                className={cn(
                  'min-h-[60px] flex-row items-center gap-3 px-[18px] py-3',
                  i > 0 && 'border-t border-border',
                )}
              >
                <GroupAvatar name={m.name} url={null} size={36} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-sans-bold text-sm text-foreground">
                    {m.name}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {m.sees.length > 0
                      ? `${teamRoleLabel(m.role).toLowerCase()} · vê ${consentSummary(m.sees).toLowerCase()}`
                      : `${teamRoleLabel(m.role).toLowerCase()} · não vê seus dados`}
                  </Text>
                </View>
                {viewedToday(m.lastViewedAt, now, DEVICE_TZ) ? (
                  <Badge variant="pending">viu hoje</Badge>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ))}
      {termo && visiveis.length === 0 ? (
        <Text className="px-1 text-xs text-muted-foreground">Ninguém da equipe com esse nome.</Text>
      ) : null}
      {!all && !termo && team.data.length > TEAM_PREVIEW ? (
        <Button size="sm" variant="outline" onPress={() => setAll(true)}>
          {`Ver toda a equipe (${team.data.length})`}
        </Button>
      ) : null}
    </View>
  );
}

function LinkRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      onPress={onPress}
      className="min-h-14 flex-row items-center gap-3 rounded-[18px] bg-card px-4 py-3 active:opacity-80"
    >
      {icon}
      <View className="flex-1">
        <Text className="font-sans-bold text-sm text-foreground">{title}</Text>
        {subtitle ? <Text className="text-xs text-muted-foreground">{subtitle}</Text> : null}
      </View>
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

/**
 * Sobre a comunidade (Cm-04), espelho de
 * `apps/web/src/app/(app)/community/[groupId]/settings/page.tsx`: quem é, o PRO
 * pago pela comunidade, os benefícios, o que eu compartilho (grava na hora),
 * quem da equipe vê, quem olhou meus dados e sair.
 */
/**
 * Anotações da equipe sobre você (#402). A equipe escreve na ficha; aqui é só
 * leitura. Somem quando você sai da comunidade e vão junto na exportação.
 */
function TeamNotesSection({ groupId, now }: { groupId: string; now: Date }) {
  const notes = useQuery({
    queryKey: ['community', 'my-notes', groupId],
    queryFn: () => myNotesApi.list(groupId),
  });
  if (!notes.data || notes.data.length === 0) return null;
  return (
    <View className="gap-2 rounded-card bg-card px-[18px] py-4">
      <Eyebrow>Anotações da equipe</Eyebrow>
      {notes.data.map((n) => (
        <View key={n.id} className="gap-0.5">
          <Text className="text-sm text-foreground">{n.text}</Text>
          <Text className="text-xs text-muted-foreground">
            {`${n.authorName ?? 'Alguém que saiu da equipe'} · ${relativeStamp(new Date(n.createdAt), now, DEVICE_TZ)}`}
          </Text>
        </View>
      ))}
      <Text className="text-xs text-faint">Só a equipe escreve. Somem se você sair.</Text>
    </View>
  );
}

export default function CommunitySettingsScreen() {
  const confirm = useConfirm();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const now = useMemo(() => new Date(), []);

  const group = useQuery({
    queryKey: ['community', 'group', groupId],
    queryFn: () => groupsApi.get(groupId),
  });
  const ativo = group.data?.status === 'ACTIVE';
  const log = useQuery({
    queryKey: ['community', 'access-log', groupId],
    queryFn: () => groupsApi.accessLog({ groupId, limit: 5 }),
    enabled: ativo,
  });
  const benefits = useQuery({
    queryKey: ['community', 'benefits', groupId],
    queryFn: () => benefitsApi.list(groupId),
    enabled: ativo,
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
      <Screen>
        <LoadingState label="Carregando a comunidade…" />
      </Screen>
    );
  }
  if (group.isError) {
    const sumiu = group.error instanceof ApiError && group.error.isNotFound;
    return (
      <Screen>
        <View className="px-5 pt-4">
          {sumiu ? (
            <EmptyState
              title="Comunidade não encontrada"
              description="Você não faz mais parte dela, ou ela não existe."
            />
          ) : (
            <ErrorState error={group.error} onRetry={() => void group.refetch()} />
          )}
        </View>
      </Screen>
    );
  }

  const g = group.data;
  const entry = entryPolicyView(g.joinPolicy);
  const ativos = (benefits.data ?? []).filter((b) => !b.expired).length;
  const confirmLeave = () =>
    confirm({
      title: ativo ? `Sair da ${g.name}?` : 'Cancelar o pedido?',
      description: ativo
        ? g.proPaidByThisGroup
          ? LEAVE_COPY.bodyPro
          : LEAVE_COPY.body
        : 'Você pode pedir de novo depois, pelo código ou por um convite.',
      confirmLabel: ativo ? 'Sair' : 'Cancelar pedido',
      cancelLabel: 'Voltar',
      destructive: true,
      onConfirm: () => leave.mutate(),
    });

  return (
    <Screen
      onRefresh={() => void Promise.all([group.refetch(), log.refetch(), benefits.refetch()])}
      refreshing={group.isRefetching}
    >
      <View className="gap-5 px-5 pb-4 pt-4">
        <View className="flex-row items-start gap-3">
          <GroupAvatar name={g.name} url={g.avatarUrl} size={56} brand={g.type === 'SPONSORED'} />
          <View className="min-w-0 flex-1 gap-1">
            <Text accessibilityRole="header" className="font-display text-h3 text-foreground">
              {g.name}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {[g.description, timezoneLabel(g.timezone)].filter(Boolean).join(' · ')}
            </Text>
            <View className="flex-row flex-wrap gap-1.5 pt-1">
              <Badge variant="pending">{VISIBILITY_WORD[g.visibility]}</Badge>
              <Badge
                variant={entry.tone === 'ok' ? 'done' : entry.tone === 'warn' ? 'lite' : 'pending'}
              >
                {entry.badge}
              </Badge>
              <Badge variant="pending">{myRoleBadge(g.role)}</Badge>
            </View>
          </View>
        </View>

        {canOpenPanel(g) ? (
          <LinkRow
            icon={<LayoutDashboard size={18} color={colors.primaryText} />}
            title="Abrir painel"
            onPress={() => router.push(panelHref(g.id))}
          />
        ) : null}

        {!ativo ? (
          <Text className="rounded-2xl border border-border bg-card p-4 text-sm text-foreground">
            {`Seu pedido está aguardando o dono aprovar. O que você escolheu compartilhar (${consentSummary(g.consentScopes).toLowerCase()}) passa a valer quando você entrar.`}
          </Text>
        ) : null}

        {g.proPaidByThisGroup ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/plan')}
            className="flex-row items-center gap-3 rounded-2xl bg-primary/10 px-4 py-3.5 active:opacity-80"
          >
            <Crown size={16} color={colors.primaryText} />
            <Text className="flex-1 text-sm text-foreground">{PRO_PAID_NOTE}</Text>
          </Pressable>
        ) : null}

        {/* Sem benefício valendo, a entrada some (Pn-28b). */}
        {ativos > 0 ? (
          <LinkRow
            icon={
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand">
                <Gift size={16} color={colors.brandForeground} />
              </View>
            }
            title="Benefícios"
            subtitle={`${ativos} ${ativos === 1 ? 'desconto' : 'descontos'} de parceiros`}
            onPress={() => router.push(`/community/${g.id}/benefits`)}
          />
        ) : null}

        {ativo ? <SharingSection g={g} /> : null}
        {ativo ? <TeamSection groupId={g.id} /> : null}
        {ativo ? <TeamNotesSection groupId={g.id} now={now} /> : null}

        {ativo ? (
          <View className="gap-2 rounded-card bg-surface-3 px-[18px] py-4">
            <Eyebrow>Quem olhou seus dados</Eyebrow>
            {log.data && log.data.length === 0 ? (
              <Text className="text-xs text-muted-foreground">
                Ninguém da equipe olhou seus dados ainda.
              </Text>
            ) : null}
            {log.data?.map((linha, i) => (
              <Text
                key={`${linha.at}-${i}`}
                className={
                  linha.denied ? 'text-xs text-muted-foreground' : 'text-sm text-foreground'
                }
              >
                {accessLogLine(linha, now, DEVICE_TZ)}
              </Text>
            ))}
          </View>
        ) : null}

        {g.role === 'OWNER' ? (
          <Text className="text-xs text-muted-foreground">
            Quem é dono não sai da comunidade: transfira-a pelo painel, em Configurações.
          </Text>
        ) : (
          <Button
            variant="outline"
            textClassName="text-danger"
            loading={leave.isPending}
            onPress={confirmLeave}
          >
            {ativo ? 'Sair da comunidade' : 'Cancelar pedido'}
          </Button>
        )}
      </View>
    </Screen>
  );
}
