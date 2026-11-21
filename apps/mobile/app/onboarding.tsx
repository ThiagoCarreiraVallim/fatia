import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import {
  ApiError,
  RESUME_NOTE,
  RESUME_TOAST,
  aiStepVariant,
  alreadyMemberGroupId,
  billingApi,
  bodyFromForm,
  brDateToIso,
  goalsRangeShift,
  groupsApi,
  isSkippableStep,
  isoToBrDate,
  mealTypeForTime,
  nextOnboardingStep,
  normalizeCommunityCode,
  nutritionApi,
  onboardingApi,
  onboardingReminderInputs,
  photoTestMealItems,
  photoTestSummary,
  previousOnboardingStep,
  progressSegment,
  remindersApi,
  resumeOnboardingStep,
  trialTerms,
  usersApi,
  type ActivityLevel,
  type BodyObjective,
  type CodeLookup,
  type FlowContext,
  type GoalsInput,
  type GroupPreview,
  type JoinConsent,
  type MealRecognition,
  type OnboardingReminderKey,
  type OnboardingStepKey,
  type SaveOnboardingInput,
} from '@fatia/api-client';
import { useAuth } from '@/auth/auth-context';
import {
  comprar as purchasePackage,
  inAppPurchaseAvailable,
  pacotesDoPro as proPackages,
  storeLogIn,
  type PurchasesPackage,
} from '@/billing/purchases';
import { isInviteToken } from '@/community/invite-link';
import { clearPendingInvite } from '@/community/pending-invite';
import { hojeIso } from '@/components/nutrition/helpers';
import {
  ActivityStep,
  AiCommunityStep,
  AiTrialStep,
  BodyStep,
  CodeStep,
  GoalsStep,
  HealthStep,
  NotificationsStep,
  ObjectiveStep,
  RemindersStep,
  ResumeNote,
  ShareStep,
  WelcomeStep,
  type BodyDraft,
  type StepNav,
} from '@/components/onboarding/onboarding-steps';
import { QrScanModal } from '@/components/onboarding/qr-scan';
import { needsAiConsent } from '@/chat/ai-consent-state';
import { WelcomePagesView } from '@/components/community/welcome-pages';
import { AiConsentCard } from '@/components/chat/consent';
import { openLegal } from '@/components/profile/legal';
import { Drawer, LoadingState, useToast } from '@/components/ui';
import { healthStepsSource } from '@/health/health-steps';
import { enablePush } from '@/notifications/push';

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Não deu para salvar agora. Tente de novo.';

/**
 * O onboarding das pranchas Onb-* (#371) no app, espelho de
 * `apps/web/src/components/onboarding/onboarding-flow.tsx`: mesmas etapas,
 * mesma ordem (de `@fatia/api-client`), cada "Continuar" salvo na API.
 *
 * Diferenças do app: a saúde do celular (Onb-P1) quando houver leitura de
 * passos, o QR da recepção pela câmera e o teste grátis pela loja (RevenueCat),
 * que some quando a compra no app está desligada.
 */
export default function OnboardingScreen() {
  const { status } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ refazer?: string; convite?: string }>();
  const redo = params.refazer === '1';
  const token = isInviteToken(params.convite) ? params.convite : null;
  const health = useMemo(() => healthStepsSource(), []);
  const canPurchase = inAppPurchaseAvailable();

  useEffect(() => {
    if (status === 'signedOut') router.replace('/login');
  }, [status, router]);

  const signedIn = status === 'signedIn';
  const me = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => usersApi.me(),
    enabled: signedIn,
  });
  const progress = useQuery({
    queryKey: ['onboarding', 'progress'],
    queryFn: () => onboardingApi.progress(),
    enabled: signedIn,
    staleTime: Infinity,
  });
  const plan = useQuery({
    queryKey: ['billing', 'plan'],
    queryFn: () => billingApi.plan(),
    enabled: signedIn,
  });
  const groups = useQuery({
    queryKey: ['community', 'mine'],
    queryFn: () => groupsApi.mine(),
    enabled: signedIn,
  });
  const invite = useQuery({
    queryKey: ['community', 'invite', token],
    queryFn: () => groupsApi.previewInvite(token as string),
    enabled: signedIn && Boolean(token),
    retry: false,
  });

  const [inviteAnswered, setInviteAnswered] = useState(false);
  const activeGroups = (groups.data ?? []).filter((g) => g.status === 'ACTIVE');
  const ctx: FlowContext = useMemo(
    () => ({
      invitePending: Boolean(invite.data) && !inviteAnswered && !redo,
      communityPages: (invite.data?.welcome?.length ?? 0) > 0,
      inCommunity: activeGroups.length > 0,
      healthAvailable: health.available,
      aiVariant: aiStepVariant(plan.data ?? null, canPurchase),
    }),
    [
      invite.data,
      inviteAnswered,
      redo,
      activeGroups.length,
      health.available,
      plan.data,
      canPurchase,
    ],
  );

  const ready =
    progress.isFetched &&
    plan.isFetched &&
    groups.isFetched &&
    me.isFetched &&
    (!token || invite.isFetched);

  const [step, setStep] = useState<OnboardingStepKey | null>(null);
  const [resumedAt, setResumedAt] = useState<OnboardingStepKey | null>(null);
  const [objective, setObjective] = useState<BodyObjective | null>(null);
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [body, setBody] = useState<BodyDraft | null>(null);
  const [goals, setGoals] = useState<GoalsInput | null>(null);
  const [tdee, setTdee] = useState<number | null>(null);
  const [goalSource, setGoalSource] = useState<'app' | 'team'>('app');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoFinish, setAutoFinish] = useState(false);

  if (ready && step === null && progress.data) {
    const saved = redo ? null : progress.data.step;
    const p = progress.data.profile;
    const start = redo ? 'objective' : resumeOnboardingStep(ctx, saved);
    setObjective(p.objective);
    setActivity(p.activityLevel);
    setBody({
      sex: p.sex,
      birthDate: p.birthDate ? isoToBrDate(p.birthDate) : '',
      heightCm: p.heightCm ?? 168,
      weightKg: p.weightKg ?? 70,
    });
    if (progress.data.draft.goals) setGoals(progress.data.draft.goals);
    if (progress.data.draft.goalSource) setGoalSource(progress.data.draft.goalSource);
    setStep(start ?? 'ai');
    if (saved && start) setResumedAt(start);
    if (!start) setAutoFinish(true);
  }

  // "Continuando de onde parou" (Onb-Retomada), uma vez.
  useEffect(() => {
    if (resumedAt) toast.show({ message: RESUME_TOAST });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumedAt]);

  useEffect(() => {
    if (autoFinish) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFinish]);

  const parsedBody = () =>
    body
      ? bodyFromForm(
          {
            sex: body.sex,
            birthDate: brDateToIso(body.birthDate),
            heightCm: String(body.heightCm),
            weightKg: String(body.weightKg),
          },
          hojeIso(),
        )
      : null;

  async function finish() {
    setPending(true);
    try {
      if (!redo) await onboardingApi.finish();
      await clearPendingInvite();
      await qc.invalidateQueries({ queryKey: ['users', 'me'] });
      void qc.invalidateQueries({ queryKey: ['onboarding'] });
      if (redo && router.canGoBack()) router.back();
      else router.replace('/');
    } catch (err) {
      setError(errorText(err));
      setPending(false);
    }
  }

  async function advance(data: Omit<SaveOnboardingInput, 'step'> = {}, from = step) {
    if (!from) return;
    const next = nextOnboardingStep(ctx, from);
    setError(null);
    if (!next) return finish();
    setPending(true);
    try {
      if (!redo) await onboardingApi.save({ ...data, step: next });
      setStep(next);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  const back = () => {
    if (!step) return;
    const prev = previousOnboardingStep(ctx, step);
    setError(null);
    if (prev) setStep(prev);
    else if (redo) router.back();
  };

  // --- convite -------------------------------------------------------------------

  async function acceptInvite(consent: JoinConsent) {
    if (!token) return;
    setPending(true);
    setError(null);
    try {
      await groupsApi.acceptInvite(token, consent);
    } catch (err) {
      if (!alreadyMemberGroupId(err)) {
        setError(
          err instanceof ApiError && err.isConflict
            ? err.message
            : 'Não deu para aceitar agora. Tente de novo.',
        );
        setPending(false);
        return;
      }
    }
    setPending(false);
    setInviteAnswered(true);
    await clearPendingInvite();
    void qc.invalidateQueries({ queryKey: ['community'] });
    void qc.invalidateQueries({ queryKey: ['billing', 'plan'] });
    await advance({}, 'share');
  }

  async function declineInvite() {
    setInviteAnswered(true);
    await clearPendingInvite();
    await advance({}, 'share');
  }

  // --- metas ---------------------------------------------------------------------

  const resumeBody = step === 'goals' && tdee === null ? parsedBody() : null;
  const resumeSuggestion = useQuery({
    queryKey: ['onboarding', 'suggestion', objective, activity, resumeBody],
    queryFn: () =>
      resumeBody?.ok && objective && activity
        ? nutritionApi.suggestGoals({ ...resumeBody.body, objective, activityLevel: activity })
        : null,
    enabled: Boolean(resumeBody?.ok && objective && activity),
    staleTime: Infinity,
  });
  const shownGoals = goals ?? resumeSuggestion.data?.goals ?? null;
  const shownTdee = tdee ?? resumeSuggestion.data?.tdee ?? null;

  async function submitActivity() {
    const parsed = parsedBody();
    if (!activity || !objective || !parsed?.ok) return;
    setPending(true);
    setError(null);
    try {
      const s = await nutritionApi.suggestGoals({
        ...parsed.body,
        objective,
        activityLevel: activity,
      });
      setTdee(s.tdee);
      setGoals(s.goals);
      setPending(false);
      await advance({ activityLevel: activity });
    } catch (err) {
      setError(errorText(err));
      setPending(false);
    }
  }

  async function submitGoals() {
    const parsed = parsedBody();
    if (!shownGoals || !objective || !activity || !parsed?.ok) return;
    const team = progress.data?.teamSuggestion;
    const chosen = goalSource === 'team' && team ? { ...shownGoals, ...team.goals } : shownGoals;
    setPending(true);
    setError(null);
    try {
      await usersApi.completeOnboarding({
        ...parsed.body,
        objective,
        activityLevel: activity,
        goals: chosen,
      });
      void qc.invalidateQueries({ queryKey: ['nutrition'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['progress'] });
      setPending(false);
      if (redo) return finish();
      await advance({});
    } catch (err) {
      setError(errorText(err));
      setPending(false);
    }
  }

  // --- lembretes ---------------------------------------------------------------------

  async function submitReminders(selected: OnboardingReminderKey[]) {
    setPending(true);
    setError(null);
    try {
      const existing = new Set((await remindersApi.list()).map((r) => r.kind));
      const inputs = onboardingReminderInputs(selected, shownGoals?.weeklyWorkouts ?? 3).filter(
        (i) => i.kind && !existing.has(i.kind),
      );
      for (const input of inputs) await remindersApi.create(input);
      void qc.invalidateQueries({ queryKey: ['reminders'] });
      setPending(false);
      await advance({});
    } catch (err) {
      setError(errorText(err));
      setPending(false);
    }
  }

  // --- notificações e saúde ------------------------------------------------------------

  async function enableNotifications() {
    setPending(true);
    await enablePush(true).catch(() => 'unavailable');
    setPending(false);
    await advance({});
  }

  async function connectHealth() {
    setPending(true);
    await health.requestAccess().catch(() => false);
    setPending(false);
    await advance({});
  }

  // --- código ---------------------------------------------------------------------

  const [lookup, setLookup] = useState<CodeLookup>({ code: '', status: 'idle' });
  const [found, setFound] = useState<GroupPreview | null>(null);
  const [joining, setJoining] = useState(false);
  const [scanning, setScanning] = useState(false);
  const lookupSeq = useRef(0);

  const onCode = (raw: string) => {
    const code = raw.replace(/\s/g, '').toUpperCase().slice(0, 32);
    const seq = ++lookupSeq.current;
    setFound(null);
    if (code.length < 3) {
      setLookup({ code, status: 'idle' });
      return;
    }
    setLookup({ code, status: 'searching' });
    groupsApi
      .previewByCode(normalizeCommunityCode(code))
      .then((g) => {
        if (seq !== lookupSeq.current) return;
        setFound(g);
        setLookup({ code, status: 'found', groupName: g.name });
      })
      .catch((err: unknown) => {
        if (seq !== lookupSeq.current) return;
        setLookup({
          code,
          status: err instanceof ApiError && err.isNotFound ? 'not-found' : 'error',
        });
      });
  };

  async function joinByCode(consent: JoinConsent) {
    if (!found) return;
    setPending(true);
    setError(null);
    try {
      await groupsApi.join(found.code, consent);
    } catch (err) {
      if (!alreadyMemberGroupId(err)) {
        setError(
          err instanceof ApiError && err.isConflict
            ? err.message
            : 'Não deu para entrar agora. Tente de novo.',
        );
        setPending(false);
        return;
      }
    }
    setJoining(false);
    setPending(false);
    await qc.invalidateQueries({ queryKey: ['community'] });
    await qc.invalidateQueries({ queryKey: ['billing', 'plan'] });
    await advance({}, 'code');
  }

  // --- IA ---------------------------------------------------------------------------

  const [photoPhase, setPhotoPhase] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [recognition, setRecognition] = useState<MealRecognition | null>(null);
  const [consentRequired, setConsentRequired] = useState(false);

  async function testPhoto() {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Para testar, o Fatia precisa da câmera.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.6,
      exif: false,
    });
    const base64 = shot.canceled ? null : shot.assets?.[0]?.base64;
    if (!base64) return;
    setPhotoPhase('scanning');
    try {
      const rec = await nutritionApi.recognizeMealPhoto(base64);
      setRecognition(rec);
      setPhotoPhase(rec.itens.length > 0 ? 'done' : 'idle');
      if (rec.itens.length === 0) setError('Nenhum alimento reconhecido. Tente outra foto.');
    } catch (err) {
      // Sem o aceite da IA a foto nem sai (403): o aceite abre e a pessoa tenta de novo.
      if (needsAiConsent(err)) setConsentRequired(true);
      else setError(errorText(err));
      setPhotoPhase('idle');
    }
  }

  async function savePhotoMeal() {
    if (!recognition) return;
    setPending(true);
    try {
      const now = new Date();
      await nutritionApi.createMeal({
        mealType: mealTypeForTime(now),
        eatenAt: now.toISOString(),
        items: photoTestMealItems(recognition),
      });
      void qc.invalidateQueries({ queryKey: ['nutrition'] });
      setPending(false);
      await advance({});
    } catch (err) {
      setError(errorText(err));
      setPending(false);
    }
  }

  // O preço do teste vem da loja (RevenueCat), nunca fixo: o pacote anual, ou o mensal.
  const packages = useQuery({
    queryKey: ['billing', 'store-packages', me.data?.id],
    queryFn: async (): Promise<PurchasesPackage[]> => {
      await storeLogIn(me.data!.id);
      return proPackages();
    },
    enabled: step === 'ai' && ctx.aiVariant === 'trial' && Boolean(me.data?.id),
    staleTime: Infinity,
  });
  const trialPackage =
    packages.data?.find((p) => p.packageType === 'ANNUAL') ?? packages.data?.[0] ?? null;

  async function startTrial() {
    if (!trialPackage) return;
    setPending(true);
    setError(null);
    try {
      const bought = await purchasePackage(trialPackage);
      if (bought) {
        await billingApi.revenueCatSync().catch(() => undefined);
        void qc.invalidateQueries({ queryKey: ['billing', 'plan'] });
      }
      setPending(false);
      if (bought) await advance({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu para começar o teste agora.');
      setPending(false);
    }
  }

  // --- desenho ---------------------------------------------------------------------

  if (!ready || !step || !body) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <LoadingState label="Carregando…" />
      </View>
    );
  }

  const nav: StepNav = {
    segment: progressSegment(step),
    onBack: previousOnboardingStep(ctx, step) || redo ? back : null,
    onSkip: isSkippableStep(step) ? () => void advance({}) : null,
  };
  const inviteData = invite.data ?? null;
  const communityName = inviteData?.group.name ?? activeGroups[0]?.name ?? null;

  let screen: React.ReactNode;
  switch (step) {
    case 'welcome':
      screen = inviteData ? (
        <WelcomeStep
          groupName={inviteData.group.name}
          team={inviteData.team}
          sponsored={inviteData.group.type === 'SPONSORED'}
          activeChallenge={inviteData.activeChallenge}
          segment={nav.segment}
          onContinue={() => void advance({})}
        />
      ) : null;
      break;
    case 'community':
      // As páginas da comunidade (#410, Onb-02b): "Pular" e o fim vão ao compartilhar.
      screen = inviteData?.welcome?.length ? (
        <WelcomePagesView
          groupName={inviteData.group.name}
          pages={inviteData.welcome}
          team={inviteData.team}
          onSkip={() => void advance({})}
          onFinish={() => void advance({})}
          onBackFirst={back}
        />
      ) : null;
      break;
    case 'share':
      screen = inviteData ? (
        <ShareStep
          nav={nav}
          team={inviteData.team}
          required={inviteData.requiredSharingScopes}
          pending={pending}
          error={error}
          onAccept={(c) => void acceptInvite(c)}
          onDecline={() => void declineInvite()}
        />
      ) : null;
      break;
    case 'objective':
      screen = (
        <ObjectiveStep
          nav={nav}
          value={objective}
          onChange={setObjective}
          onContinue={() => objective && void advance({ objective })}
        />
      );
      break;
    case 'body':
      screen = (
        <BodyStep
          nav={nav}
          value={body}
          error={error}
          onChange={setBody}
          onContinue={() => {
            const parsed = parsedBody();
            if (!parsed?.ok) {
              setError(Object.values(parsed?.errors ?? {})[0] ?? 'Confira os dados.');
              return;
            }
            void advance(parsed.body);
          }}
        />
      );
      break;
    case 'activity':
      screen = (
        <ActivityStep
          nav={nav}
          value={activity}
          pending={pending}
          error={error}
          onChange={setActivity}
          onContinue={() => void submitActivity()}
          resumed={
            resumedAt === 'activity' ? (
              <ResumeNote title={RESUME_NOTE.title} body={RESUME_NOTE.body} />
            ) : undefined
          }
        />
      );
      break;
    case 'goals':
      screen = shownGoals ? (
        <GoalsStep
          nav={nav}
          goals={shownGoals}
          tdee={shownTdee}
          team={progress.data?.teamSuggestion ?? null}
          source={goalSource}
          pending={pending}
          error={error}
          onShift={(d) => setGoals(goalsRangeShift(shownGoals, d))}
          onWorkouts={(n) => setGoals({ ...shownGoals, weeklyWorkouts: n })}
          onSource={(s) => {
            setGoalSource(s);
            if (!redo)
              void onboardingApi
                .save({ step: 'goals', goals: shownGoals, goalSource: s })
                .catch(() => undefined);
          }}
          onContinue={() => void submitGoals()}
        />
      ) : (
        <LoadingState label="Calculando…" />
      );
      break;
    case 'reminders':
      screen = (
        <RemindersStep
          nav={nav}
          weeklyWorkouts={shownGoals?.weeklyWorkouts ?? 3}
          pending={pending}
          error={error}
          onContinue={(sel) => void submitReminders(sel)}
        />
      );
      break;
    case 'notifications':
      screen = (
        <NotificationsStep
          nav={nav}
          communityName={communityName}
          pending={pending}
          onEnable={() => void enableNotifications()}
          onLater={() => void advance({})}
        />
      );
      break;
    case 'health':
      screen = (
        <HealthStep
          nav={nav}
          sourceName={health.name}
          pending={pending}
          onConnect={() => void connectHealth()}
          onLater={() => void advance({})}
        />
      );
      break;
    case 'code':
      screen =
        joining && found ? (
          <ShareStep
            nav={{ ...nav, onBack: () => setJoining(false) }}
            team={found.team}
            required={found.requiredSharingScopes}
            pending={pending}
            error={error}
            onAccept={(c) => void joinByCode(c)}
            onDecline={() => setJoining(false)}
            declineLabel="Voltar"
          />
        ) : (
          <CodeStep
            nav={nav}
            lookup={lookup}
            onCode={onCode}
            onScan={() => setScanning(true)}
            onJoin={() => setJoining(true)}
            onNoCode={() => void advance({})}
          />
        );
      break;
    case 'ai':
      if (ctx.aiVariant === 'community') {
        screen = (
          <AiCommunityStep
            nav={nav}
            groupName={plan.data?.groupName ?? communityName ?? 'sua comunidade'}
            phase={photoPhase}
            result={recognition ? photoTestSummary(recognition) : null}
            error={error}
            saving={pending}
            onTest={() => void testPhoto()}
            onSave={() => void savePhotoMeal()}
            onLater={() => void advance({})}
            onOtherCode={() => setStep('code')}
          />
        );
        screen = (
          <>
            {screen}
            <Drawer open={consentRequired} onOpenChange={setConsentRequired} snapPoints={['85%']}>
              <AiConsentCard
                onDecline={() => setConsentRequired(false)}
                onAccepted={() => setConsentRequired(false)}
              />
            </Drawer>
          </>
        );
      } else {
        screen = (
          <AiTrialStep
            nav={nav}
            terms={
              trialPackage
                ? trialTerms({
                    price: trialPackage.product.priceString,
                    interval: trialPackage.packageType === 'ANNUAL' ? 'YEARLY' : 'MONTHLY',
                    today: new Date(),
                    channel: 'store',
                  })
                : null
            }
            pending={pending}
            error={error ?? (packages.isError ? 'A loja não respondeu agora.' : null)}
            onStart={() => void startTrial()}
            onLater={() => void advance({})}
            onLegal={openLegal}
          />
        );
      }
      break;
    default:
      screen = null;
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {screen}
      </ScrollView>
      <QrScanModal
        open={scanning}
        onClose={() => setScanning(false)}
        onCode={(code) => {
          setScanning(false);
          onCode(code);
        }}
      />
    </View>
  );
}
