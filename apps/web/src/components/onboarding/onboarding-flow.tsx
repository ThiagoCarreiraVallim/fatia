'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  RESUME_NOTE,
  RESUME_TOAST,
  aiStepVariant,
  alreadyMemberGroupId,
  billingApi,
  bodyFromForm,
  brDateToIso,
  formatPriceCents,
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
import { PLAN_QUERY_KEY } from '@/components/billing/plan-screen';
import { communityKeys } from '@/components/community/query-keys';
import { useWebPush } from '@/components/notifications/use-web-push';
import { hojeIso } from '@/lib/dias';
import { AiConsentCard } from '@/components/chat/aceite';
import {
  INVITE_COOKIE,
  SIGNUP_NAME_COOKIE,
  clearClientCookie,
  readClientCookie,
  writeClientCookie,
} from '@/lib/onboarding-cookies';
import {
  ActivityStep,
  AiCommunityStep,
  AiTrialStep,
  BodyStep,
  CodeStep,
  GoalsStep,
  NotificationsStep,
  ObjectiveStep,
  RemindersStep,
  ResumeNote,
  ResumeToast,
  ShareStep,
  WelcomeStep,
  type BodyDraft,
  type StepNav,
} from './onboarding-steps';

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Não deu para salvar agora. Tente de novo.';

/** Foto → JPEG em base64, no máximo 1280 px no lado maior (o teto da API é pequeno). */
async function photoToBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8).split(',')[1] ?? '';
}

/**
 * O onboarding das pranchas Onb-* (#371) no PWA: com convite (boas-vindas e o
 * que compartilhar), sem convite (do login direto ao objetivo) e a retomada.
 *
 * Cada "Continuar" grava a etapa seguinte e o que acabou de ser respondido
 * (`PATCH /users/me/onboarding`); quem fecha a aba volta na mesma tela, já
 * preenchida. As metas concluem o perfil; da etapa 8 em diante tudo é pulável,
 * e o fim leva ao Hoje com o cartão "Primeiros passos".
 */
export function OnboardingFlow({
  redo = false,
  returnTo = null,
  inviteToken = null,
}: {
  /** `?refazer=1`: refaz objetivo, corpo e metas sem mexer na etapa salva. */
  redo?: boolean;
  returnTo?: string | null;
  /** `?convite=`: o link de convite que trouxe a pessoa. */
  inviteToken?: string | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const push = useWebPush();

  // O convite fica num cookie para a retomada: quem fecha a aba e volta pelo
  // endereço puro ainda vê as boas-vindas da comunidade.
  const [token] = useState(() => inviteToken ?? readClientCookie(INVITE_COOKIE));
  useEffect(() => {
    if (inviteToken) writeClientCookie(INVITE_COOKIE, inviteToken, 7 * 24 * 3600);
  }, [inviteToken]);

  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const progress = useQuery({
    queryKey: ['onboarding', 'progress'],
    queryFn: () => onboardingApi.progress(),
    staleTime: Infinity,
  });
  const plan = useQuery({ queryKey: PLAN_QUERY_KEY, queryFn: () => billingApi.plan() });
  const groups = useQuery({ queryKey: communityKeys.mine, queryFn: () => groupsApi.mine() });
  const invite = useQuery({
    queryKey: ['community', 'invite', token],
    queryFn: () => groupsApi.previewInvite(token as string),
    enabled: Boolean(token),
    retry: false,
  });

  // O nome digitado na criação da conta (Onb-01b) chega por cookie e vai para o perfil.
  const nameSent = useRef(false);
  useEffect(() => {
    if (nameSent.current || !me.data) return;
    const name = readClientCookie(SIGNUP_NAME_COOKIE)?.trim();
    if (!name) return;
    nameSent.current = true;
    clearClientCookie(SIGNUP_NAME_COOKIE);
    if (me.data.name !== name) {
      void usersApi
        .updateMe({ name })
        .then(() => qc.invalidateQueries({ queryKey: ['users', 'me'] }));
    }
  }, [me.data, qc]);

  const [inviteAnswered, setInviteAnswered] = useState(false);
  const activeGroups = (groups.data ?? []).filter((g) => g.status === 'ACTIVE');
  const ctx: FlowContext = useMemo(
    () => ({
      invitePending: Boolean(invite.data) && !inviteAnswered && !redo,
      inCommunity: activeGroups.length > 0,
      healthAvailable: false,
      aiVariant: aiStepVariant(plan.data ?? null, plan.data?.webCheckout ?? false),
    }),
    [invite.data, inviteAnswered, redo, activeGroups.length, plan.data],
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

  // Preenche uma vez, quando tudo chega: o que a pessoa tocar depois manda.
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
    // Não sobrou etapa (a salva era a última e saiu do fluxo): só terminar.
    if (!start) setAutoFinish(true);
  }

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

  async function finish(target?: string) {
    setPending(true);
    try {
      if (!redo) await onboardingApi.finish();
      clearClientCookie(INVITE_COOKIE);
      await qc.invalidateQueries({ queryKey: ['users', 'me'] });
      void qc.invalidateQueries({ queryKey: ['onboarding'] });
      router.replace(target ?? (redo ? '/nutrition/goals' : (returnTo ?? '/')));
    } catch (err) {
      setError(errorText(err));
      setPending(false);
    }
  }

  /** Grava a etapa seguinte (com o que acabou de ser respondido) e anda. */
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
    else if (redo) router.replace('/nutrition/goals');
  };

  // --- convite (Onb-02 e Onb-03) ----------------------------------------------

  const answerInvite = () => {
    setInviteAnswered(true);
    clearClientCookie(INVITE_COOKIE);
  };

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
    answerInvite();
    void qc.invalidateQueries({ queryKey: ['community'] });
    void qc.invalidateQueries({ queryKey: PLAN_QUERY_KEY });
    await advance({}, 'share');
  }

  async function declineInvite() {
    answerInvite();
    await advance({}, 'share');
  }

  // --- metas (Onb-07) -----------------------------------------------------------

  async function calculate() {
    const parsed = parsedBody();
    if (!objective || !activity || !parsed?.ok) return;
    const s = await nutritionApi.suggestGoals({
      ...parsed.body,
      objective,
      activityLevel: activity,
    });
    setTdee(s.tdee);
    setGoals(s.goals);
  }

  // Retomada direto nas metas: refaz a conta para a régua (o rascunho manda nas faixas).
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
    if (!activity) return;
    setPending(true);
    setError(null);
    try {
      await calculate();
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

  // --- lembretes (Onb-08) --------------------------------------------------------

  async function submitReminders(selected: OnboardingReminderKey[]) {
    setPending(true);
    setError(null);
    try {
      // Voltar a esta tela não duplica: só cria o tipo que ainda não existe.
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

  // --- código (Onb-Codigo) ---------------------------------------------------------

  const [lookup, setLookup] = useState<CodeLookup>({ code: '', status: 'idle' });
  const [found, setFound] = useState<GroupPreview | null>(null);
  const [joining, setJoining] = useState(false);
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
      .previewBySlug(normalizeCommunityCode(code))
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
      await groupsApi.join(found.slug, consent);
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
    await qc.invalidateQueries({ queryKey: PLAN_QUERY_KEY });
    await advance({}, 'code');
  }

  // --- IA (Onb-10a) -----------------------------------------------------------------

  const fileRef = useRef<HTMLInputElement>(null);
  const [photoPhase, setPhotoPhase] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [recognition, setRecognition] = useState<MealRecognition | null>(null);
  const [consentRequired, setConsentRequired] = useState(false);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoPhase('scanning');
    setError(null);
    try {
      const rec = await nutritionApi.recognizeMealPhoto(await photoToBase64(file));
      setRecognition(rec);
      setPhotoPhase(rec.itens.length > 0 ? 'done' : 'idle');
      if (rec.itens.length === 0) setError('Nenhum alimento reconhecido. Tente outra foto.');
    } catch (err) {
      // Sem o aceite da IA a foto nem sai (403): o aceite aparece e a pessoa tenta de novo.
      if (err instanceof ApiError && err.isAiConsentRequired) setConsentRequired(true);
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

  // --- desenho ---------------------------------------------------------------------

  if (!ready || !step || !body) {
    return (
      <p role="status" className="pt-10 text-center text-sm text-muted-foreground">
        Carregando…
      </p>
    );
  }

  const nav: StepNav = {
    segment: progressSegment(step),
    onBack: previousOnboardingStep(ctx, step) || redo ? back : null,
    onSkip: isSkippableStep(step) ? () => void advance({}) : null,
  };
  const toast = resumedAt ? <ResumeToast text={RESUME_TOAST} /> : null;
  const inviteData = invite.data ?? null;
  const communityName = inviteData?.group.name ?? activeGroups[0]?.name ?? null;

  let screen: React.ReactNode;
  switch (step) {
    case 'welcome':
      screen = inviteData && (
        <WelcomeStep
          groupName={inviteData.group.name}
          team={inviteData.team}
          sponsored={inviteData.group.type === 'SPONSORED'}
          activeChallenge={inviteData.activeChallenge}
          segment={nav.segment}
          onContinue={() => void advance({})}
        />
      );
      break;
    case 'share':
      screen = inviteData && (
        <ShareStep
          nav={nav}
          team={inviteData.team}
          required={inviteData.requiredSharingScopes}
          pending={pending}
          error={error}
          onAccept={(c) => void acceptInvite(c)}
          onDecline={() => void declineInvite()}
        />
      );
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
        <p role="status" className="pt-10 text-center text-sm text-muted-foreground">
          Calculando…
        </p>
      );
      break;
    case 'reminders':
      screen = (
        <RemindersStep
          nav={nav}
          weeklyWorkouts={shownGoals?.weeklyWorkouts ?? 3}
          pending={pending}
          onContinue={(sel) => void submitReminders(sel)}
        />
      );
      break;
    case 'notifications':
      screen = (
        <NotificationsStep
          nav={nav}
          communityName={communityName}
          pending={pending || push.busy}
          onEnable={() => {
            void push
              .enable()
              .catch(() => undefined)
              .finally(() => void advance({}));
          }}
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
            scanAvailable={false}
            onScan={() => undefined}
            onJoin={() => setJoining(true)}
            onNoCode={() => void advance({})}
          />
        );
      break;
    case 'ai':
      if (ctx.aiVariant === 'community') {
        const summary = recognition ? photoTestSummary(recognition) : null;
        screen = (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              aria-label="Foto do prato"
              onChange={(e) => void onPhoto(e.target.files?.[0])}
            />
            <AiCommunityStep
              nav={nav}
              groupName={plan.data?.groupName ?? communityName ?? 'sua comunidade'}
              phase={photoPhase}
              result={summary}
              error={error}
              saving={pending}
              onTest={() => fileRef.current?.click()}
              onSave={() => void savePhotoMeal()}
              onLater={() => void advance({})}
              onOtherCode={() => setStep('code')}
            />
            {consentRequired ? (
              <AiConsentCard
                className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md"
                onDecline={() => setConsentRequired(false)}
                onAccepted={() => setConsentRequired(false)}
              />
            ) : null}
          </>
        );
      } else {
        const cents = plan.data?.prices?.yearlyCents ?? null;
        screen = (
          <AiTrialStep
            nav={nav}
            terms={
              cents
                ? trialTerms({
                    price: formatPriceCents(cents),
                    interval: 'YEARLY',
                    today: new Date(),
                    channel: 'web',
                  })
                : 'Grátis por 7 dias. Renova sozinho; cancele quando quiser em Meu plano.'
            }
            pending={pending}
            // Na web o teste começa no checkout do plano (Meu plano).
            onStart={() => void finish('/plan')}
            onLater={() => void advance({})}
          />
        );
      }
      break;
    default:
      screen = null;
  }

  return (
    <>
      {toast}
      {screen}
    </>
  );
}
