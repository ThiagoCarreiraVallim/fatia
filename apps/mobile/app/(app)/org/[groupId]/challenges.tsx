import { useState, type ReactNode } from 'react';
import { Image, Pressable, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CHALLENGE_DESCRIPTION_MAX,
  CHALLENGE_TITLE_MAX,
  challengePeriod,
  challengeProblem,
  challengesApi,
  formatInteger,
  KIND_INFO,
  maxPointsOf,
  METRIC_INFO,
  POINT_ITEM_INFO,
  REVIEW_REASON_MAX,
  STEP_SOURCE_LABEL,
  STEPS_CLOSED_TEXT,
  STEPS_SYNC_AVAILABLE,
  type Challenge,
  type MyGroup,
  type PointItem,
  type CheckinReviewItem,
  type StepSource,
} from '@fatia/api-client';
import { ChallengeStatusBadge, KindIcon } from '@/components/challenges/challenge-ui';
import {
  challengeInputFromForm,
  clampStep,
  defaultChallengeForm,
  FORM_KINDS,
  FORM_LIMITS,
  FORM_POINT_ITEMS,
  kindShort,
  liters,
  reviewReasonProblem,
  SELECTABLE_STEP_SOURCES,
  whenLabel,
  type ChallengeForm,
} from '@/components/challenges/challenge-view';
import { challengeListKey } from '@/components/challenges/join-challenge-drawer';
import { localToday } from '@/components/workout/agenda-view';
import { apiMessage, Choice, OrgPanel, PanelCard } from '@/components/org/org-panel';
import {
  Button,
  Chip,
  EmptyState,
  Icon,
  Input,
  LoadingState,
  cn,
  useConfirm,
} from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { colors } from '@/theme/colors';

/**
 * − número + : o número também é digitável (regra de usabilidade do redesign).
 * `format` mostra o valor quando o campo não está em edição.
 */
function NumberStepper({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format = formatInteger,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace(/\D/g, ''));
    if (Number.isFinite(n) && draft.trim()) onChange(Math.min(max, Math.max(min, n)));
    setDraft(null);
  };
  return (
    <View className="flex-row items-center gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Diminuir ${label}`}
        disabled={value <= min}
        onPress={() => onChange(clampStep(value, -step, min, max))}
        className={cn(
          'h-11 w-11 items-center justify-center rounded-full bg-muted',
          value <= min && 'opacity-40',
        )}
      >
        <Text className="font-sans-bold text-lg text-foreground">−</Text>
      </Pressable>
      <TextInput
        accessibilityLabel={label}
        keyboardType="number-pad"
        value={draft ?? format(value)}
        onFocus={() => setDraft(String(value))}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        selectionColor={colors.primaryText}
        className="min-h-[44px] min-w-[72px] rounded-md bg-muted px-2 text-center font-sans-bold text-sm text-foreground"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Aumentar ${label}`}
        disabled={value >= max}
        onPress={() => onChange(clampStep(value, step, min, max))}
        className={cn(
          'h-11 w-11 items-center justify-center rounded-full bg-muted',
          value >= max && 'opacity-40',
        )}
      >
        <Text className="font-sans-bold text-lg text-foreground">+</Text>
      </Pressable>
    </View>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <View>
        <Text className="font-sans-semibold text-sm text-foreground">{title}</Text>
        {hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** Novo desafio (Pn-13): título, tipo e as regras do tipo; começo e duração prontos. */
function NewChallenge({ g, today, onDone }: { g: MyGroup; today: string; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState<ChallengeForm>(defaultChallengeForm);
  const set = <K extends keyof ChallengeForm>(k: K, v: ChallengeForm[K]) =>
    setF((old) => ({ ...old, [k]: v }));
  const input = challengeInputFromForm(f, today);
  const problem = challengeProblem(input, today);
  const soma = maxPointsOf(input.pointsTable ?? {});

  const save = useMutation({
    mutationFn: () => challengesApi.create(g.id, input),
    onSuccess: () => {
      toast.show({ message: 'Desafio agendado. Os membros recebem um aviso quando começar.' });
      void qc.invalidateQueries({ queryKey: challengeListKey(g.id), exact: true });
      onDone();
    },
    onError: (err) =>
      toast.show({ message: apiMessage(err, 'Não deu para marcar o desafio agora.') }),
  });

  const setPoint = (item: PointItem, v: number) =>
    setF((old) => {
      const points = { ...old.points, [item]: v };
      // O máximo acompanha a soma quando estava nela (o caso comum).
      const prev = maxPointsOf(old.points);
      const next = maxPointsOf(points);
      return {
        ...old,
        points,
        maxPointsPerDay: old.maxPointsPerDay >= prev ? next : Math.min(old.maxPointsPerDay, next),
      };
    });

  const toggleSource = (s: StepSource) =>
    set(
      'stepSources',
      f.stepSources.includes(s) ? f.stepSources.filter((x) => x !== s) : [...f.stepSources, s],
    );

  return (
    <PanelCard title="Novo desafio">
      <Input
        value={f.title}
        onChangeText={(v) => set('title', v)}
        maxLength={CHALLENGE_TITLE_MAX}
        accessibilityLabel="Título"
        placeholder="Título. Ex.: 30 dias de treino"
      />

      <Row title="O que conta">
        <View accessibilityRole="radiogroup" className="gap-2">
          {FORM_KINDS.map((k) => {
            const on = f.kind === k;
            return (
              <Pressable
                key={k}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => set('kind', k)}
                className={cn(
                  'flex-row items-center gap-3 rounded-[14px] bg-muted p-3',
                  on && 'border-2 border-primary',
                )}
              >
                <KindIcon kind={k} />
                <View className="min-w-0 flex-1">
                  <Text className="font-sans-bold text-sm text-foreground">
                    {KIND_INFO[k].label}
                  </Text>
                  <Text className="text-xs text-muted-foreground">{KIND_INFO[k].explain}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        {STEPS_SYNC_AVAILABLE ? null : (
          <Text className="text-xs text-muted-foreground">{STEPS_CLOSED_TEXT}</Text>
        )}
      </Row>

      {f.kind === 'METRIC' ? (
        <>
          <Choice
            label="Qual conta"
            options={(['WORKOUT_SESSIONS', 'ACTIVE_DAYS', 'STREAK_DAYS'] as const).map((m) => ({
              value: m,
              label: METRIC_INFO[m].label,
            }))}
            value={f.metric}
            onChange={(v) => set('metric', v)}
          />
          <Text className="text-xs text-muted-foreground">{METRIC_INFO[f.metric].explain}</Text>
        </>
      ) : null}

      {f.kind === 'NUTRITION' ? (
        <>
          <Choice
            label="Qual meta"
            options={[
              { value: 'PROTEIN_TARGET_DAYS', label: 'Dias batendo proteína' },
              { value: 'KCAL_IN_RANGE_DAYS', label: 'Dias na faixa de calorias' },
            ]}
            value={f.nutritionMetric}
            onChange={(v) => set('nutritionMetric', v)}
          />
          <Text className="text-xs text-muted-foreground">
            Cada pessoa compete contra a própria meta. Não existe desafio de “menos calorias” nem de
            perda de peso.
          </Text>
        </>
      ) : null}

      {f.kind === 'POINTS' ? (
        <Row
          title="Quanto vale cada coisa"
          hint="0 tira o item do desafio. O treino precisa do check-in com foto; a água conta até o teto."
        >
          {FORM_POINT_ITEMS.map((item) => (
            <View key={item} className="flex-row items-center gap-3">
              <View className="min-w-0 flex-1">
                <Text className="text-sm text-foreground">{POINT_ITEM_INFO[item].label}</Text>
                <Text className="text-xs text-muted-foreground">
                  {POINT_ITEM_INFO[item].explain}
                </Text>
              </View>
              <NumberStepper
                label={`Pontos de ${POINT_ITEM_INFO[item].label}`}
                value={f.points[item]}
                onChange={(v) => setPoint(item, v)}
                {...FORM_LIMITS.point}
              />
            </View>
          ))}
          <View className="flex-row items-center gap-3">
            <Text className="flex-1 font-sans-semibold text-sm text-foreground">
              Máximo por dia
            </Text>
            <NumberStepper
              label="Máximo de pontos por dia"
              value={Math.min(f.maxPointsPerDay, Math.max(1, soma))}
              onChange={(v) => set('maxPointsPerDay', v)}
              min={1}
              max={Math.max(1, Math.min(FORM_LIMITS.maxPointsPerDay.max, soma))}
              step={1}
            />
          </View>
        </Row>
      ) : null}

      {f.kind === 'WATER' ? (
        <>
          <Row title="Meta de água por dia" hint="1 ponto por dia na meta; beber mais não dá mais.">
            <NumberStepper
              label="Meta de água por dia, em ml"
              value={f.waterGoalMl}
              onChange={(v) =>
                setF((o) => ({ ...o, waterGoalMl: v, dailyCap: Math.max(o.dailyCap, v) }))
              }
              format={liters}
              {...FORM_LIMITS.waterGoalMl}
            />
          </Row>
          <Row title="Conta até" hint="Acima disso no dia o app não soma.">
            <NumberStepper
              label="Teto de água por dia, em ml"
              value={f.dailyCap}
              onChange={(v) => set('dailyCap', v)}
              format={liters}
              {...FORM_LIMITS.dailyCap}
              min={Math.max(FORM_LIMITS.dailyCap.min, f.waterGoalMl)}
            />
          </Row>
        </>
      ) : null}

      {f.kind === 'STEPS' ? (
        <>
          <Row title="Passos por dia" hint="Vale 1 ponto por dia, não importa quanto passar.">
            <NumberStepper
              label="Passos por dia"
              value={f.stepsGoal}
              onChange={(v) => set('stepsGoal', v)}
              {...FORM_LIMITS.stepsGoal}
            />
          </Row>
          <Row title="Fontes de passos aceitas">
            <View className="flex-row flex-wrap gap-2">
              {SELECTABLE_STEP_SOURCES.map((s) => (
                <Chip
                  key={s}
                  label={STEP_SOURCE_LABEL[s]}
                  selected={f.stepSources.includes(s)}
                  onPress={() => toggleSource(s)}
                />
              ))}
              <View
                accessibilityState={{ disabled: true }}
                className="min-h-9 justify-center rounded-pill border border-dashed border-border px-4 opacity-60"
              >
                <Text className="font-sans-semibold text-[13px] text-muted-foreground">
                  {`${STEP_SOURCE_LABEL.MANUAL} · não conta`}
                </Text>
              </View>
            </View>
          </Row>
        </>
      ) : null}

      <Choice
        label="Começa"
        options={[
          { value: 'today', label: 'Hoje' },
          { value: 'tomorrow', label: 'Amanhã' },
          { value: 'monday', label: 'Segunda' },
        ]}
        value={f.start}
        onChange={(v) => set('start', v)}
      />
      <Choice
        label="Duração"
        options={[
          { value: '7', label: '7 dias' },
          { value: '14', label: '14 dias' },
          { value: '30', label: '30 dias' },
        ]}
        value={f.duration}
        onChange={(v) => set('duration', v)}
      />
      <Text className="text-xs text-muted-foreground">
        {`${challengePeriod(input)}. Datas livres ficam no painel da web.`}
      </Text>
      <Input
        value={f.description}
        onChangeText={(v) => set('description', v)}
        maxLength={CHALLENGE_DESCRIPTION_MAX}
        multiline
        className="min-h-[80px]"
        textAlignVertical="top"
        accessibilityLabel="Descrição (opcional)"
        placeholder="Descrição (opcional): regras, prêmio, recado da equipe."
      />
      <View className="flex-row items-start gap-2 rounded-xl bg-muted p-3">
        <Icon name="eye" size={16} color={colors.mutedForeground} />
        <Text className="flex-1 text-xs text-muted-foreground">
          Quem não participa vê o ranking e as regras, nunca fotos nem números. Foto de check-in só
          a pessoa e a equipe que revisa veem. Água, passos e nutrição mostram só os dias.
        </Text>
      </View>
      {problem && f.title.trim() ? (
        <Text accessibilityRole="alert" className="text-sm text-danger">
          {problem}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <Button variant="ghost" className="flex-1" onPress={onDone}>
          Cancelar
        </Button>
        <Button
          className="flex-1"
          disabled={Boolean(problem)}
          loading={save.isPending}
          onPress={() => save.mutate()}
        >
          Agendar desafio
        </Button>
      </View>
      <Text className="text-xs text-muted-foreground">
        Os membros recebem um aviso quando o desafio começar.
      </Text>
    </PanelCard>
  );
}

const TYPE_LABEL: Record<CheckinReviewItem['type'], string> = {
  photo: 'foto',
  water: 'água',
  steps: 'passos',
};

/** Um item da fila: a foto (só a equipe vê), o porquê, e Vale ou Anular com motivo. */
function ReviewCard({ g, item }: { g: MyGroup; item: CheckinReviewItem }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const problem = reviewReasonProblem(reason);
  const resolve = useMutation({
    mutationFn: (decision: 'valid' | 'void') =>
      challengesApi.resolve(g.id, item.challengeId, item.id, {
        decision,
        ...(decision === 'void' ? { reason: reason.trim() } : {}),
      }),
    onSuccess: (r) => {
      toast.show({
        message:
          r.status === 'voided'
            ? `${item.displayName} vai receber o motivo.`
            : 'Valeu: o ponto voltou a contar.',
      });
      void qc.invalidateQueries({ queryKey: ['community', 'challenges', g.id, 'review'] });
      void qc.invalidateQueries({ queryKey: challengeListKey(g.id), exact: true });
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para decidir agora.') }),
  });
  // Hoje no fuso da comunidade: o dia do item é dela, não o UTC (passada visual #395).
  const today = localToday(new Date(), g.timezone);
  const when = whenLabel(item.date, item.capturedAt, today);
  const origem =
    item.source === 'system'
      ? 'sinalizado pelo sistema'
      : `sinalizado por ${item.flags} ${item.flags === 1 ? 'participante' : 'participantes'}`;

  return (
    <View className="gap-2.5 rounded-[14px] border border-border p-3">
      <View className="flex-row items-center gap-2">
        <Icon
          name={item.type === 'photo' ? 'camera' : item.type === 'water' ? 'drop' : 'steps'}
          size={18}
          color={colors.mutedForeground}
        />
        <View className="min-w-0 flex-1">
          <Text className="font-sans-bold text-sm text-foreground">
            {`${item.displayName} · ${when}`}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {`${item.challengeTitle} · ${TYPE_LABEL[item.type]}${item.points ? ` +${item.points}` : ''}`}
          </Text>
        </View>
      </View>
      {item.photoUrl ? (
        <Image
          source={{ uri: item.photoUrl }}
          accessibilityLabel={`Foto do check-in de ${item.displayName}`}
          accessibilityIgnoresInvertColors
          style={{ width: '100%', height: 220, borderRadius: 12 }}
          resizeMode="cover"
        />
      ) : null}
      {item.why ? <Text className="text-sm text-foreground">{item.why}</Text> : null}
      <Text className="text-xs text-muted-foreground">
        {[
          item.type === 'photo'
            ? item.workoutLinked
              ? 'treino ligado'
              : 'sem treino ligado'
            : null,
          origem,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {item.caption ? (
        <Text className="text-xs italic text-muted-foreground">{`“${item.caption}”`}</Text>
      ) : null}

      {voiding ? (
        <View className="gap-2">
          <Input
            value={reason}
            onChangeText={setReason}
            maxLength={REVIEW_REASON_MAX}
            multiline
            textAlignVertical="top"
            className="min-h-[72px]"
            accessibilityLabel="Motivo, enviado à pessoa"
            placeholder="Motivo, enviado à pessoa. Ex.: foto de outro dia."
          />
          {problem && reason.trim() ? (
            <Text accessibilityRole="alert" className="text-xs text-danger">
              {problem}
            </Text>
          ) : null}
          <View className="flex-row gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="flex-1"
              onPress={() => {
                setVoiding(false);
                setReason('');
              }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="danger"
              className="flex-1"
              disabled={Boolean(problem)}
              loading={resolve.isPending}
              onPress={() => resolve.mutate('void')}
            >
              Anular e avisar
            </Button>
          </View>
        </View>
      ) : (
        <View className="flex-row gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            loading={resolve.isPending && resolve.variables === 'valid'}
            onPress={() => resolve.mutate('valid')}
          >
            Vale
          </Button>
          <Button size="sm" variant="danger" className="flex-1" onPress={() => setVoiding(true)}>
            Anular
          </Button>
        </View>
      )}
    </View>
  );
}

function ReviewQueue({ g }: { g: MyGroup }) {
  // Paginada (#395 M5): a fila junta os desafios da comunidade e passa do teto de um.
  const queue = useInfiniteQuery({
    queryKey: ['community', 'challenges', g.id, 'review'],
    queryFn: ({ pageParam }) => challengesApi.reviewQueue(g.id, undefined, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const first = queue.data?.pages[0];
  const items = queue.data?.pages.flatMap((p) => p.items) ?? [];
  const open = first?.open ?? 0;
  return (
    <PanelCard>
      <View className="flex-row items-center justify-between gap-2">
        <Text accessibilityRole="header" className="font-sans-bold text-sm text-foreground">
          Para revisar
        </Text>
        {first ? (
          <Badge variant={open ? 'lite' : 'done'}>
            {open ? `${open} para decidir` : 'fila vazia'}
          </Badge>
        ) : null}
      </View>
      <Text className="text-xs text-muted-foreground">
        Enquanto ninguém decide, o ponto fica pendente. Se for anulado, a pessoa recebe o motivo. Só
        ela e a equipe veem esta fila.
      </Text>
      {queue.isPending ? <LoadingState /> : null}
      {queue.isError ? (
        <Text className="text-sm text-danger">
          {apiMessage(queue.error, 'Não deu para carregar a fila agora.')}
        </Text>
      ) : null}
      {items.map((item) => (
        <ReviewCard key={item.id} g={g} item={item} />
      ))}
      {queue.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={queue.isFetchingNextPage}
          onPress={() => void queue.fetchNextPage()}
        >
          Ver mais
        </Button>
      ) : null}
    </PanelCard>
  );
}

function Challenges({ g }: { g: MyGroup }) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: challengeListKey(g.id),
    queryFn: () => challengesApi.list(g.id),
  });
  const reload = () => qc.invalidateQueries({ queryKey: challengeListKey(g.id), exact: true });
  const end = useMutation({
    mutationFn: (id: string) => challengesApi.end(g.id, id),
    onSuccess: () => {
      toast.show({ message: 'Desafio encerrado. Os participantes foram avisados.' });
      void reload();
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para encerrar agora.') }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => challengesApi.remove(g.id, id),
    onSuccess: () => {
      toast.show({ message: 'Desafio apagado.' });
      void reload();
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para apagar agora.') }),
  });

  if (list.isPending) return <LoadingState />;
  const challenges = list.data?.challenges ?? [];
  const canReview = challenges.some((c) => c.canReview);
  const ask = (c: Challenge, action: 'end' | 'remove') =>
    confirm({
      title: action === 'end' ? `Encerrar ${c.title}?` : `Apagar ${c.title}?`,
      description:
        action === 'end'
          ? 'O ranking fecha com o que foi registrado até agora. O pódio sai depois da fila de revisão. Não dá para reabrir.'
          : 'Ele ainda não começou: quem já entrou deixa de ver o desafio.',
      confirmLabel: action === 'end' ? 'Encerrar' : 'Apagar',
      destructive: true,
      onConfirm: () => (action === 'end' ? end.mutate(c.id) : remove.mutate(c.id)),
    });

  return (
    <>
      <Text className="text-xs text-muted-foreground">
        Contam constância, nunca peso ou medidas. Quem não participa pode olhar o ranking e as
        regras, sem ver fotos nem números de ninguém.
      </Text>
      {creating && list.data ? (
        <NewChallenge g={g} today={list.data.today} onDone={() => setCreating(false)} />
      ) : (
        <Button variant="add" onPress={() => setCreating(true)}>
          Novo desafio
        </Button>
      )}
      {canReview ? <ReviewQueue g={g} /> : null}
      {challenges.length === 0 && !creating ? (
        <EmptyState
          title="Nenhum desafio ainda"
          description="Marque um check-in com foto, água, passos, nutrição ou pontos somando tudo."
        />
      ) : null}
      {challenges.map((c) => (
        <PanelCard key={c.id}>
          <View className="flex-row items-center gap-3">
            <KindIcon kind={c.kind} ended={c.status === 'ended'} />
            <View className="min-w-0 flex-1">
              <Text className="font-sans-bold text-sm text-foreground">{c.title}</Text>
              <Text className="text-xs text-muted-foreground">
                {`${kindShort(c)} · ${challengePeriod(c)} · ${c.participants} ${c.participants === 1 ? 'participante' : 'participantes'}`}
              </Text>
            </View>
            <ChallengeStatusBadge challenge={c} />
          </View>
          {c.resultPending ? (
            <Text className="text-xs text-warning">
              Encerrado: o pódio sai quando a fila de revisão deste desafio estiver vazia.
            </Text>
          ) : null}
          {c.canManage && c.status === 'running' ? (
            <Button variant="outline" onPress={() => ask(c, 'end')}>
              Encerrar agora
            </Button>
          ) : null}
          {c.canManage && c.status === 'upcoming' ? (
            <Button variant="outline" onPress={() => ask(c, 'remove')}>
              Apagar
            </Button>
          ) : null}
        </PanelCard>
      ))}
    </>
  );
}

/** Desafios no painel (Pn-13), espelho de `apps/web/src/app/(org)/org/[groupId]/challenges/page.tsx`. */
export default function OrgChallengesScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <OrgPanel groupId={groupId}>{(g) => <Challenges g={g} />}</OrgPanel>;
}
