'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Check, Minus, Plus, Trophy } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  feelingToRpe,
  loadFieldValue,
  loadToKg,
  loadUnitLabel,
  newSetClientKey,
  prefillForNextSet,
  workoutApi,
  type ExerciseGroup,
  type LoadPrescription,
  type SessionSet,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { formatNumber, loadValue, parseDecimalInput, parseFirstRep, targetSetsOf } from './format';
import { RestTimer } from './rest-timer';
import { FeelingPicker, SetChips } from './set-chips';
import { DEFAULT_REST_SECONDS, type RestTimer as RestTimerState } from './use-rest-timer';

/**
 * Card do exercício de força em foco na sessão.
 *
 * O descanso e o pedido de RPE são da página, não do card (ver
 * `use-rest-timer.ts`): ao registrar a última série o foco passa para o próximo
 * exercício e este card desmonta. Com os dois aqui dentro, o descanso zerava e
 * o drawer de RPE da última série sumia antes de a pessoa responder — o app já
 * tinha subido os dois para a tela, e o PWA segue o mesmo desenho.
 */
interface Props {
  sessionId: string;
  /** Início da sessão em ISO. Recorta o histórico no que veio **antes** dela. */
  sessionStartedAt: string;
  group: ExerciseGroup;
  rest: RestTimerState;
  onFinishExercise: () => void;
  /** Pede o RPE da série recém-registrada. */
  onAskRpe: (set: SessionSet) => void;
  /** A última série planejada acabou de ser registrada (#377: "passar sozinho"). */
  onExerciseComplete?: () => void;
  /** Frase para o leitor de tela quando a série é registrada. */
  onAnnounce?: (message: string) => void;
  /** "1/7" e as setas do exercício, à direita da linha da série (prancha `Al-T3d`). */
  nav?: ReactNode;
  /** "Todas ›", ao lado dos chips das séries: abre o treino atual. */
  onAll?: () => void;
  /** O "Passar sozinho", que a prancha põe logo acima do "Concluir série". */
  beforeSubmit?: ReactNode;
}

export function ActiveExerciseCard({
  sessionId,
  sessionStartedAt,
  group,
  rest,
  onFinishExercise,
  onAskRpe,
  onExerciseComplete,
  onAnnounce,
  nav,
  onAll,
  beforeSubmit,
}: Props) {
  const qc = useQueryClient();
  const targetSets = targetSetsOf(group);
  const doneSets = group.sets.length;
  const isComplete = doneSets >= targetSets;

  const lastSet = group.sets[doneSets - 1];

  // A referência é a última série deste exercício **antes** desta sessão. O
  // recorte é do servidor, via `before`: filtrar no cliente exigiria manter a
  // resposta em cache para sempre e, quando o cache expirasse no meio do
  // treino, a única candidata seria a série de hoje — que o filtro descartaria,
  // fazendo a referência sumir sozinha.
  const previous = useQuery({
    queryKey: ['workout', 'last-set', group.exerciseId, sessionStartedAt],
    queryFn: () => workoutApi.getLastSet(group.exerciseId, sessionStartedAt),
  });
  const reference = previous.data ?? null;

  const pr = useQuery({
    queryKey: ['workout', 'pr', group.exerciseId],
    queryFn: () => workoutApi.getPersonalRecord(group.exerciseId),
    staleTime: 60_000,
  });
  const prWeight =
    pr.data && 'weightKg' in pr.data && pr.data.weightKg != null ? pr.data.weightKg : null;
  const prReps = pr.data && 'reps' in pr.data && pr.data.reps != null ? pr.data.reps : null;

  // A prescrição depende da faixa alvo do exercício no plano, que esta tela já
  // tem — por isso ela vai na chave do cache junto com o id.
  const prescriptionQuery = useQuery({
    queryKey: ['workout', 'prescription', group.exerciseId, group.targetReps],
    queryFn: () => workoutApi.getPrescription(group.exerciseId, group.targetReps),
    staleTime: 60_000,
  });
  // O tipo é anotado à mão: sem ele, o `data` chega ao teste de `status` como
  // inferência ainda pendente do `useQuery` e o TypeScript não estreita a
  // união — a anotação é o que faz `status: 'ok'` valer como discriminante.
  const prescribed: LoadPrescription | undefined = prescriptionQuery.data;
  const prescription = prescribed?.status === 'ok' ? prescribed : null;
  // A prescrição só preenche o campo (`prefillForNextSet`): a frase
  // "Sugestão: 62,5 kg × 8 · RPE alto na última sessão" saiu a pedido do dono,
  // porque repetia o número que já está no campo.
  // O descanso prescrito ganha do padrão da tela: 180s depois de uma tripla
  // pesada e 60s depois de rosca direta não são a mesma pausa.
  const restTarget = prescription?.restSeconds ?? DEFAULT_REST_SECONDS;

  const [weight, setWeight] = useState<number>(lastSet?.weightKg ?? 0);
  const [reps, setReps] = useState<number>(lastSet?.reps ?? parseFirstRep(group.targetReps));
  const [touched, setTouched] = useState(false);

  // Calculado no render e não dentro do efeito para que as dependências sejam
  // só os dois números: os objetos de série trocam de identidade a cada refetch
  // do React Query e reescreveriam o campo por cima do que a pessoa digita.
  const prefill = prefillForNextSet({
    touched,
    sessionLastSet: lastSet,
    previousSessionSet: reference,
    prescription,
  });
  const prefillWeight = prefill.weightKg;
  const prefillReps = prefill.reps;

  // Ajuste durante o render, e não num efeito (#187). A comparação é a **mesma**
  // que o efeito fazia no array de dependências, então o palpite é aplicado
  // exatamente nos mesmos momentos — só que antes de pintar, em vez de um quadro
  // depois. O estado anterior começa em `null/null`, e não no palpite atual, para
  // reproduzir também a passagem de montagem que o `useEffect` fazia: sem isso, o
  // card montado já com série da sessão nasceria com os campos zerados.
  const [prevPrefill, setPrevPrefill] = useState<{ weightKg: number | null; reps: number | null }>({
    weightKg: null,
    reps: null,
  });
  if (
    !Object.is(prevPrefill.weightKg, prefillWeight) ||
    !Object.is(prevPrefill.reps, prefillReps)
  ) {
    setPrevPrefill({ weightKg: prefillWeight, reps: prefillReps });
    if (prefillWeight != null) setWeight(prefillWeight);
    if (prefillReps != null) setReps(prefillReps);
  }

  // "Como foi a série?" (#377): opcional. Respondida aqui, grava no `rpe` e a
  // pergunta de depois (o drawer de RPE) não aparece.
  const [feeling, setFeeling] = useState<number | null>(null);
  // Uma chave por toque em "Concluir série": o reenvio depois de uma falha usa
  // a mesma, e a API devolve a série já gravada em vez de duplicar.
  const clientKey = useRef<string | null>(null);

  const logSet = useMutation({
    mutationFn: (key: string) =>
      workoutApi.logSet(sessionId, {
        exerciseId: group.exerciseId,
        // `??` e não `||`: carga 0 é carga. Barra fixa, paralela e afins são
        // peso corporal, e um `||` gravaria `null` — o exercício nunca teria
        // histórico e a referência da próxima vez nunca apareceria. Reps 0 não
        // tem essa leitura: é campo em branco, e segue sem ser enviado.
        weightKg: weight ?? undefined,
        reps: reps || undefined,
        rpe: feeling != null ? feelingToRpe(feeling) : undefined,
        clientKey: key,
      }),
    onSuccess: (created) => {
      clientKey.current = null;
      const answered = feeling != null;
      setFeeling(null);
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
      onAnnounce?.(`Série ${doneSets + 1} de ${targetSets} registrada. Descanso iniciado.`);
      rest.start(restTarget);
      if (!answered) onAskRpe(created);
      if (doneSets + 1 >= targetSets) onExerciseComplete?.();
    },
  });

  function concludeSet() {
    clientKey.current ??= newSetClientKey();
    logSet.mutate(clientKey.current);
  }

  // Carga na unidade da pessoa (Você › Unidades, #387): o estado e a API
  // continuam em kg; só o campo e as dicas mostram em lb.
  const units = useUnitPrefs();
  const unitLabel = loadUnitLabel(units.loadUnit);
  const setNumber = Math.min(doneSets + 1, targetSets);
  // Só "Série N de M" (prancha Al-T3d): a meta já está embaixo das reps e a
  // última vez no "Anterior" dos campos — a linha longa repetia os dois.
  const headline = `Série ${setNumber} de ${targetSets}`;
  const isRecord = prWeight != null && prWeight > 0 && weight > prWeight;

  const record =
    prWeight != null
      ? `recorde ${loadValue(prWeight, units)} ${unitLabel}${prReps != null ? ` × ${prReps}` : ''}`
      : prReps != null
        ? `recorde ${prReps} reps`
        : null;
  const resting = rest.remaining != null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[15px] text-muted-foreground tabular-nums">{headline}</p>
        {nav}
      </div>

      {isRecord && (
        <p className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs font-extrabold text-primary-text">
          <span aria-hidden>🏆</span>
          Recorde!
        </p>
      )}

      <SetChips
        sessionId={sessionId}
        sets={group.sets}
        isCardio={false}
        targetSets={targetSets}
        onAll={onAll}
      />

      {resting && (
        <RestTimer
          timer={rest}
          idleSeconds={restTarget}
          next={
            isComplete
              ? null
              : `Próxima: série ${setNumber} · ${formatNumber(loadFieldValue(weight, units.loadUnit))} ${unitLabel} × ${reps}`
          }
        />
      )}

      {!isComplete && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <Stepper
              label={unitLabel}
              accessibleLabel={`carga em ${units.loadUnit === 'LB' ? 'libras' : 'quilos'} para ${group.exerciseName}`}
              value={loadFieldValue(weight, units.loadUnit)}
              step={units.loadUnit === 'LB' ? 5 : 2.5}
              onChange={(n) => {
                setTouched(true);
                setWeight(loadToKg(Math.max(0, n), units.loadUnit));
              }}
              caption={
                record ? (
                  <span className="inline-flex min-w-0 items-center gap-1 text-steps">
                    <Trophy size={13} aria-hidden className="shrink-0" />
                    <span className="truncate">{record}</span>
                  </span>
                ) : null
              }
              hint={
                reference?.weightKg != null
                  ? `Anterior: ${loadValue(reference.weightKg, units)} ${unitLabel}`
                  : undefined
              }
            />
            <Stepper
              label="reps"
              accessibleLabel={`repetições para ${group.exerciseName}`}
              value={reps}
              step={1}
              integer
              onChange={(n) => {
                setTouched(true);
                setReps(Math.max(0, Math.round(n)));
              }}
              caption={group.targetReps ? `meta ${group.targetReps}` : null}
              hint={reference?.reps != null ? `Anterior: ${reference.reps} reps` : undefined}
            />
          </div>

          {!resting && (
            <div className="space-y-2.5">
              <p className="font-display text-[17px] font-semibold text-foreground">
                Como foi a série?
              </p>
              <FeelingPicker label="Como foi a série?" value={feeling} onChange={setFeeling} />
            </div>
          )}
        </>
      )}

      {beforeSubmit}

      <button
        type="button"
        onClick={onFinishExercise}
        className="anim-press mx-auto flex h-11 items-center px-4 text-[13px] font-bold text-muted-foreground"
      >
        Finalizar exercício
      </button>

      {logSet.isError && (
        <p role="alert" className="text-center text-xs text-danger">
          Não foi possível registrar a série
          {logSet.error instanceof Error ? `: ${logSet.error.message}` : '.'}
        </p>
      )}

      {/* Preso embaixo da tela (prancha Al-T3, pedido do dono): o conteúdo rola
          acima dele. `sticky`, e não `fixed`: o botão segue ocupando o lugar
          dele no fim do card, então o último item nunca fica atrás. A barra de
          baixo some na sessão; 22 px da borda, acima da área segura. */}
      <div className="sticky bottom-[calc(22px+env(safe-area-inset-bottom))] z-30 md:bottom-4">
        <Button
          className="h-[60px] w-full rounded-full text-base font-extrabold shadow-[0_12px_32px_-8px_hsl(var(--background))]"
          onClick={concludeSet}
          disabled={logSet.isPending || isComplete}
        >
          <Check size={18} className="mr-1.5" />
          {logSet.isPending
            ? 'Registrando...'
            : isComplete
              ? 'Exercício completo'
              : `Concluir série ${setNumber}`}
        </Button>
      </div>
    </div>
  );
}

/**
 * Campo de número com `−`/`+` e toque no valor para digitar.
 *
 * Os rótulos nomeiam o exercício ("Aumentar carga em quilos para Supino"), como
 * no app: dois "Aumentar" idênticos na mesma tela não dizem a quem usa leitor de
 * tela qual dos dois está sob o foco. Alvos de 44px pelo mesmo motivo do
 * descanso — a mão que toca acabou de largar a barra.
 */
function Stepper({
  label,
  accessibleLabel,
  value,
  step,
  integer,
  onChange,
  caption,
  hint,
}: {
  label: string;
  /** Em minúscula: entra no meio de "Aumentar …" e "Editar …". */
  accessibleLabel: string;
  value: number;
  step: number;
  integer?: boolean;
  onChange: (n: number) => void;
  /** Logo abaixo do número: o recorde, a meta. */
  caption?: ReactNode;
  hint?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function startEditing() {
    setDraft(formatNumber(value));
    setEditing(true);
  }

  function commit() {
    const parsed = parseDecimalInput(draft);
    if (parsed != null) onChange(integer ? Math.round(parsed) : parsed);
    setEditing(false);
  }

  const roundButton =
    'anim-press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-3 text-foreground';

  return (
    <div className="flex flex-col items-center rounded-card bg-card px-3 py-4">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      {editing ? (
        <input
          autoFocus
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="h-12 w-full bg-transparent text-center font-display text-[40px] font-semibold text-foreground tabular-nums outline-none"
          aria-label={`Valor de ${accessibleLabel}`}
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className="h-12 min-w-14 font-display text-[40px] font-semibold leading-none text-foreground tabular-nums"
          aria-label={`Editar ${accessibleLabel}: ${formatNumber(value)}`}
        >
          {formatNumber(value)}
        </button>
      )}
      <p className="mt-1 flex h-4 max-w-full items-center text-[11px] font-bold text-muted-foreground">
        {caption}
      </p>
      {hint && <p className="text-[10px] text-faint tabular-nums">{hint}</p>}
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={() => onChange(value - step)}
          className={roundButton}
          aria-label={`Diminuir ${accessibleLabel}`}
        >
          <Minus size={18} />
        </button>
        <button
          type="button"
          onClick={() => onChange(value + step)}
          className={roundButton}
          aria-label={`Aumentar ${accessibleLabel}`}
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
