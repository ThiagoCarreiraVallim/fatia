import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  challengePeriod,
  challengesApi,
  KIND_INFO,
  type ActivityItem,
  type ChallengeDetail,
} from '@fatia/api-client';
import { ChallengeStatusBadge, Leaderboard, Podium } from '@/components/challenges/challenge-ui';
import {
  activityBadge,
  activityText,
  challengeCta,
  challengeRules,
  heroPct,
  heroSubtitle,
  heroTitle,
  kindShort,
  POINT_ICON,
  privacyLine,
  rankNote,
  todayRows,
  usesCheckin,
  whenLabel,
  type ChallengeAction,
} from '@/components/challenges/challenge-view';
import {
  challengeKey,
  challengeListKey,
  JoinChallengeDrawer,
} from '@/components/challenges/join-challenge-drawer';
import { Screen } from '@/components/layout/screen';
import { apiMessage } from '@/components/org/org-panel';
import { WaterSheet } from '@/components/today/water-sheet';
import {
  Button,
  DrawerLayer,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  cn,
  useConfirm,
} from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { colors } from '@/theme/colors';

type Tab = 'activity' | 'ranking' | 'rules';

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** As abas do Cm-17, sublinhadas como as da comunidade. */
function TabBar({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: Tab; label: string }[];
  value: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <View accessibilityRole="tablist" className="flex-row gap-5 border-b border-border">
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <Pressable
            key={t.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(t.value)}
            className={cn(
              'min-h-[44px] justify-center border-b-2',
              on ? 'border-primary' : 'border-transparent',
            )}
          >
            <Text
              className={cn(
                'font-sans-semibold text-[15px]',
                on ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ActivityCard({
  item,
  challenge: c,
  today,
  onFlag,
  flagging,
}: {
  item: ActivityItem;
  challenge: ChallengeDetail;
  today: string;
  onFlag: () => void;
  flagging: boolean;
}) {
  const text = activityText(item, c);
  const badge = activityBadge(item);
  const when = whenLabel(item.date, item.at, today);
  const icon = item.type === 'checkin' ? 'camera' : POINT_ICON[item.parts[0] ?? 'workout'];
  return (
    <View
      className={cn(
        'gap-2.5 rounded-card bg-card p-3.5',
        item.status === 'review' && 'border-[1.5px] border-warning/45',
      )}
    >
      <View className="flex-row items-center gap-2">
        <View className="h-7 w-7 items-center justify-center rounded-full bg-surface-3">
          <Text className="font-sans-bold text-[11px] text-foreground">
            {initials(item.displayName)}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-sans-bold text-sm text-foreground">
            {item.isMe ? `${item.displayName} (você)` : item.displayName}
          </Text>
          <Text className="text-xs text-muted-foreground">{when}</Text>
        </View>
        {c.kind === 'POINTS' && item.status === 'valid' ? (
          <Badge variant="done">{`+${item.points}`}</Badge>
        ) : null}
        {badge ? (
          <Badge variant={badge.tone === 'warn' ? 'lite' : 'risk'}>{badge.label}</Badge>
        ) : null}
      </View>

      {/* A foto só aparece para a própria pessoa (ADR 044): a API manda a URL só na linha dela. */}
      {item.isMe && item.photoUrl ? (
        <View className="h-[200px] overflow-hidden rounded-2xl bg-muted">
          <Image
            source={{ uri: item.photoUrl }}
            accessibilityLabel="Sua foto do check-in"
            accessibilityIgnoresInvertColors
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
          <View className="absolute bottom-2.5 left-2.5 rounded-lg bg-black/65 px-2 py-1">
            <Text className="font-sans-extrabold text-[11px] uppercase tracking-wider text-white">
              {`${when} · só você e a equipe veem`}
            </Text>
          </View>
        </View>
      ) : null}

      <View className="flex-row items-center gap-3 rounded-[14px] bg-muted p-3">
        <Icon name={icon} size={18} color={colors.mutedForeground} />
        <View className="min-w-0 flex-1">
          <Text className="font-sans-bold text-sm text-foreground">{text.title}</Text>
          {text.detail ? (
            <Text className="text-xs text-muted-foreground">{text.detail}</Text>
          ) : null}
        </View>
      </View>

      {item.isMe && item.status !== 'valid' ? (
        <View className="flex-row items-start gap-2 rounded-xl bg-warning/10 p-3">
          <Icon name="shield" size={16} color={colors.warning} />
          <Text className="flex-1 text-[13px] text-foreground">
            {item.status === 'review'
              ? `Em revisão pela equipe${item.reason ? `: ${item.reason}` : ''}. Não conta até ser aprovado.`
              : `Anulado pela equipe${item.reason ? `: ${item.reason}` : ''}.`}
          </Text>
        </View>
      ) : null}

      {item.flaggedByMe ? (
        <View className="flex-row items-start gap-2 rounded-xl bg-warning/10 p-3">
          <Icon name="shield" size={16} color={colors.warning} />
          <Text className="flex-1 text-[13px] text-foreground">
            Você sinalizou. A equipe vai olhar; seu nome não aparece para a pessoa.
          </Text>
        </View>
      ) : item.canFlag ? (
        <Button
          size="xs"
          variant="outline"
          className="self-start"
          loading={flagging}
          accessibilityLabel={`Sinalizar o check-in de ${item.displayName}`}
          onPress={onFlag}
        >
          <Icon name="alert" size={16} color={colors.foreground} />
          <Text className="font-sans-bold text-[13px] text-foreground">Não parece válido</Text>
        </Button>
      ) : null}
    </View>
  );
}

/**
 * A tela do desafio (Cm-17, Cm-17b, Cm-17c; Cm-10 e Cm-11), espelho de
 * `apps/web/src/app/(app)/community/[groupId]/challenges/[challengeId]/page.tsx`.
 * Quem participa vê o herói, a atividade, o ranking e as regras; quem só olha,
 * o ranking e as regras. Foto de check-in só a própria pessoa vê (ADR 044).
 */
export default function CommunityChallengeScreen() {
  const { challengeId } = useLocalSearchParams<{ challengeId: string }>();
  // A rota fica montada ao abrir outro desafio por link: sem a chave, a gaveta
  // de entrar, a aba e a água ficavam do desafio anterior (passada visual #395).
  return <ChallengeScreen key={challengeId} />;
}

function ChallengeScreen() {
  const confirm = useConfirm();
  const router = useRouter();
  const { groupId, challengeId, join } = useLocalSearchParams<{
    groupId: string;
    challengeId: string;
    join?: string;
  }>();
  const qc = useQueryClient();
  const toast = useToast();
  const [joinOpen, setJoining] = useState<boolean | null>(null);
  const [water, setWater] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);

  const key = challengeKey(groupId, challengeId);
  const query = useQuery({
    queryKey: key,
    queryFn: () => challengesApi.get(groupId, challengeId),
    retry: false,
  });
  const refreshList = () =>
    void qc.invalidateQueries({ queryKey: challengeListKey(groupId), exact: true });

  const c = query.data;
  // "Participar" no cartão da lista (`?join=1`) abre a folha já aqui, com o apelido sugerido.
  const joining = joinOpen ?? (join === '1' && Boolean(c && !c.me && c.status !== 'ended'));

  const leave = useMutation({
    mutationFn: () => challengesApi.leave(groupId, challengeId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      refreshList();
      toast.show({ message: 'Você saiu do desafio.' });
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para sair agora.') }),
  });
  const flag = useMutation({
    mutationFn: (checkinId: string) => challengesApi.flag(groupId, challengeId, checkinId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      toast.show({ message: 'Enviado para a equipe revisar.' });
    },
    onError: (err) =>
      toast.show({ message: apiMessage(err, 'Não deu para sinalizar agora. Tente de novo.') }),
  });
  const watch = useMutation({
    mutationFn: (on: boolean) => challengesApi.watch(groupId, challengeId, on),
    onSuccess: ({ watching }) => {
      qc.setQueryData<ChallengeDetail>(key, (old) => (old ? { ...old, watching } : old));
      refreshList();
      toast.show({
        message: watching ? 'Você recebe um aviso quando o desafio começar.' : 'Aviso desligado.',
      });
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para mudar o aviso agora.') }),
  });

  if (query.isPending) {
    return (
      <Screen>
        <LoadingState label="Carregando o desafio…" />
      </Screen>
    );
  }
  if (!c) {
    return (
      <Screen>
        <View className="px-5 pt-4">
          {query.error && !(query.error instanceof ApiError && query.error.status < 500) ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : (
            <EmptyState
              title="Desafio não encontrado"
              description="Ele pode ter sido apagado, ou você não está mais na comunidade."
            />
          )}
        </View>
      </Screen>
    );
  }

  const ended = c.status === 'ended';
  const inside = Boolean(c.me);
  const hasActivity = inside && c.kind !== 'METRIC' && c.status !== 'upcoming';
  const tabs: { value: Tab; label: string }[] = [
    ...(hasActivity
      ? [{ value: 'activity' as const, label: c.kind === 'PHOTO' ? 'Check-ins' : 'Atividade' }]
      : []),
    { value: 'ranking', label: 'Ranking' },
    { value: 'rules', label: 'Regras' },
  ];
  const current: Tab = tab && tabs.some((t) => t.value === tab) ? tab : tabs[0]!.value;
  const cta = challengeCta(c);
  const pct = heroPct(c);
  const privacy = privacyLine(c);
  const todayYmd = c.today?.date ?? new Date().toISOString().slice(0, 10);
  const waterGoal =
    c.today?.items.find((i) => i.item === 'water')?.goal ?? c.rules.waterGoalMl ?? 2500;

  const act = (a: ChallengeAction) => {
    if (a === 'checkin') router.push(`/community/${groupId}/challenges/${challengeId}/checkin`);
    else if (a === 'water') setWater(true);
    else if (a === 'meal') router.push('/nutrition');
    else router.push('/progress/charts');
  };

  const askFlag = (item: ActivityItem) =>
    confirm({
      title: 'Este check-in não parece válido?',
      description:
        'A equipe vai olhar e decidir. Enquanto isso, ele não conta. A pessoa não sabe quem sinalizou, e você não vê a foto.',
      confirmLabel: 'Sinalizar',
      onConfirm: () => flag.mutate(item.id),
    });

  const askLeave = () =>
    confirm({
      title: 'Sair do desafio?',
      description: usesCheckin(c)
        ? 'Seu apelido e sua pontuação saem do ranking, e suas fotos de check-in são apagadas na hora. Dá para entrar de novo enquanto ele não acabar.'
        : 'Seu apelido e sua pontuação saem do ranking. Dá para entrar de novo enquanto ele não acabar.',
      confirmLabel: 'Sair',
      destructive: true,
      onConfirm: () => leave.mutate(),
    });

  const footer = ended ? undefined : inside ? (
    cta ? (
      <Button className="h-14 flex-1 rounded-pill" onPress={() => act(cta.action)}>
        <Icon name={cta.icon} size={16} color={colors.primaryForeground} />
        <Text className="font-sans-bold text-[15px] text-primary-foreground">{cta.label}</Text>
      </Button>
    ) : undefined
  ) : (
    <Button className="h-14 flex-1 rounded-pill" onPress={() => setJoining(true)}>
      <Text className="font-sans-bold text-[15px] text-primary-foreground">
        Participar do desafio
      </Text>
    </Button>
  );

  return (
    <>
      <Screen
        title={c.title}
        onRefresh={() => void query.refetch()}
        refreshing={query.isRefetching}
        footer={footer}
      >
        <View className="gap-3.5 px-5 pb-6 pt-2">
          <View className="flex-row flex-wrap items-center gap-2">
            <ChallengeStatusBadge challenge={c} />
            <Text className="flex-1 text-xs text-muted-foreground">
              {`${challengePeriod(c)} · ${kindShort(c)} · ${c.participants} ${c.participants === 1 ? 'pessoa' : 'pessoas'}`}
            </Text>
          </View>
          {c.description ? <Text className="text-sm text-foreground">{c.description}</Text> : null}
          {c.endedEarly ? (
            <Text className="text-xs text-muted-foreground">
              A equipe encerrou o desafio antes da data.
            </Text>
          ) : null}

          {c.me && !ended ? (
            <View className="gap-2.5 rounded-card bg-primary p-[18px]">
              <View className="flex-row items-center gap-3">
                <View className="flex-1">
                  <Text className="font-sans-bold text-xs uppercase text-primary-foreground/70">
                    {`Você, como ${c.me.displayName}`}
                  </Text>
                  <Text className="font-display text-h2 text-primary-foreground">
                    {heroTitle(c)}
                  </Text>
                  {heroSubtitle(c) ? (
                    <Text className="font-sans-semibold text-[13px] text-primary-foreground/80">
                      {heroSubtitle(c)}
                    </Text>
                  ) : null}
                </View>
                <Icon name={KIND_INFO[c.kind].icon} size={32} color={colors.primaryForeground} />
              </View>
              {pct !== null && c.status === 'running' ? (
                <View className="h-2 overflow-hidden rounded bg-black/20">
                  <View
                    className="h-full rounded bg-primary-foreground"
                    style={{ width: `${pct * 100}%` }}
                  />
                </View>
              ) : null}
              {c.me.pendingReview > 0 ? (
                <Text className="text-xs text-primary-foreground/80">
                  {c.me.pendingReview === 1
                    ? '1 item seu está em revisão pela equipe.'
                    : `${c.me.pendingReview} itens seus estão em revisão pela equipe.`}
                </Text>
              ) : null}
            </View>
          ) : null}

          {c.kind === 'POINTS' && c.today ? (
            <View className="gap-1 rounded-card bg-card px-4 py-3.5">
              <View className="flex-row items-center justify-between pb-1.5">
                <Text className="font-sans-bold text-[15px] text-foreground">
                  Seus pontos de hoje
                </Text>
                <Badge variant="done">{`${c.today.points} de ${c.today.maxPoints ?? 0}`}</Badge>
              </View>
              {todayRows(c.today).map((r, i) => (
                <Pressable
                  key={r.item}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.title}, ${r.detail}, ${r.done ? 'feito' : 'falta'}`}
                  onPress={() => act(r.action)}
                  className={cn(
                    'min-h-[52px] flex-row items-center gap-3 active:opacity-80',
                    i > 0 && 'border-t border-border',
                  )}
                >
                  <View
                    className={cn(
                      'h-7 w-7 items-center justify-center rounded-full',
                      r.done ? 'bg-primary' : 'border-[1.5px] border-border-strong',
                    )}
                  >
                    {r.done ? (
                      <Icon name="check" size={16} color={colors.primaryForeground} />
                    ) : null}
                  </View>
                  <Icon name={r.icon} size={16} color={colors.mutedForeground} />
                  <View className="min-w-0 flex-1">
                    <Text className="font-sans-bold text-sm text-foreground">{r.title}</Text>
                    <Text className="text-xs text-muted-foreground">{r.detail}</Text>
                  </View>
                  <Text
                    className={cn(
                      'font-sans-bold text-sm',
                      r.done ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {r.points}
                  </Text>
                </Pressable>
              ))}
              <Text className="pt-1.5 text-xs text-muted-foreground">
                {`Máximo de ${c.today.maxPoints ?? 0} pontos por dia. Os pontos de água, passos e nutrição entram sozinhos.`}
              </Text>
            </View>
          ) : null}

          {!inside && !ended ? (
            <View className="gap-2 rounded-card bg-card p-4">
              <Text className="font-sans-bold text-foreground">
                {`${KIND_INFO[c.kind].label}, ${challengePeriod(c)}`}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {`${KIND_INFO[c.kind].explain} ${c.participants} ${c.participants === 1 ? 'pessoa participando' : 'pessoas participando'}.`}
              </Text>
              {c.status === 'upcoming' ? (
                <Button
                  size="sm"
                  variant={c.watching ? 'outline' : 'secondary'}
                  loading={watch.isPending}
                  onPress={() => watch.mutate(!c.watching)}
                >
                  {c.watching ? 'Avisaremos quando começar' : 'Me avise quando começar'}
                </Button>
              ) : null}
            </View>
          ) : null}

          {privacy && !ended ? (
            <View className="flex-row items-start gap-2 rounded-[14px] bg-card px-3 py-2.5">
              <Icon name="eye" size={16} color={colors.mutedForeground} />
              <Text className="flex-1 text-xs text-muted-foreground">{privacy}</Text>
            </View>
          ) : null}

          {ended ? (
            <>
              {c.resultPending ? (
                <View className="flex-row items-start gap-2 rounded-[14px] bg-warning/10 px-3 py-2.5">
                  <Icon name="clock" size={16} color={colors.warning} />
                  <Text className="flex-1 text-[13px] text-foreground">
                    Resultado depois da revisão da equipe. O pódio sai quando a fila de revisão
                    estiver vazia, em até 24 h.
                  </Text>
                </View>
              ) : c.leaderboard ? (
                <Podium entries={c.leaderboard} />
              ) : null}
              {c.leaderboard ? (
                <Leaderboard challenge={c} entries={c.leaderboard} final={!c.resultPending} />
              ) : (
                <Text className="text-sm text-muted-foreground">
                  Este desafio terminou. O ranking ficou para quem participou.
                </Text>
              )}
              {c.me?.medal && !c.resultPending ? (
                <Button variant="outline" onPress={() => router.push('/progress/achievements')}>
                  <Icon name="medal" size={16} color={colors.foreground} />
                  <Text className="text-sm font-semibold text-foreground">Ver nas conquistas</Text>
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <TabBar tabs={tabs} value={current} onChange={setTab} />

              {current === 'activity' ? (
                c.activity.length === 0 ? (
                  <EmptyState
                    title="Nada por aqui ainda"
                    description={
                      usesCheckin(c)
                        ? 'Os check-ins e os dias na meta de quem participa aparecem aqui. Fotos, só a própria pessoa vê.'
                        : 'Os dias na meta de quem participa aparecem aqui.'
                    }
                  />
                ) : (
                  <View className="gap-3">
                    {c.activity.map((item) => (
                      <ActivityCard
                        key={`${item.type}-${item.id}`}
                        item={item}
                        challenge={c}
                        today={todayYmd}
                        onFlag={() => askFlag(item)}
                        flagging={flag.isPending && flag.variables === item.id}
                      />
                    ))}
                  </View>
                )
              ) : null}

              {current === 'ranking' ? (
                c.leaderboard ? (
                  <View className="gap-2">
                    {c.status === 'upcoming' ? (
                      <Text className="text-xs text-muted-foreground">
                        A contagem começa no primeiro dia.
                      </Text>
                    ) : null}
                    <Leaderboard challenge={c} entries={c.leaderboard} />
                    <Text className="text-xs text-muted-foreground">{rankNote(c)}</Text>
                  </View>
                ) : (
                  <Text className="text-sm text-muted-foreground">
                    O ranking deste desafio aparece só para quem participa.
                  </Text>
                )
              ) : null}

              {current === 'rules' ? (
                <View className="overflow-hidden rounded-card bg-card">
                  {challengeRules(c).map((r, i) => (
                    <View
                      key={r.title}
                      className={cn(
                        'flex-row items-start gap-3 px-[18px] py-3.5',
                        i > 0 && 'border-t border-border',
                      )}
                    >
                      <Icon name={r.icon} size={20} color={colors.mutedForeground} />
                      <View className="flex-1 gap-0.5">
                        <Text className="font-sans-bold text-sm text-foreground">{r.title}</Text>
                        <Text className="text-xs text-muted-foreground">{r.text}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {c.me ? (
                <Button
                  variant="ghost"
                  textClassName="text-danger"
                  loading={leave.isPending}
                  onPress={askLeave}
                >
                  Sair do desafio
                </Button>
              ) : null}
            </>
          )}
        </View>
      </Screen>
      <DrawerLayer>
        <JoinChallengeDrawer
          groupId={groupId}
          challenge={c}
          suggestedName={c.suggestedDisplayName}
          open={joining}
          onOpenChange={setJoining}
        />
        <WaterSheet
          open={water}
          onOpenChange={(o) => {
            setWater(o);
            if (!o) void qc.invalidateQueries({ queryKey: key });
          }}
          targetMl={waterGoal}
        />
      </DrawerLayer>
    </>
  );
}
