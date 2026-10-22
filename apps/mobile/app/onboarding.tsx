import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react-native';
import {
  ACTIVITY_OPTIONS,
  GOAL_RANGES,
  GOAL_SINGLES,
  OBJECTIVE_OPTIONS,
  ONBOARDING_STEPS,
  SEX_OPTIONS,
  bodyFromForm,
  brDateToIso,
  goalsFromForm,
  goalsToForm,
  initialBodyForm,
  isoToBrDate,
  maskBrDate,
  nutritionApi,
  progressApi,
  usersApi,
  type ActivityLevel,
  type BodyErrors,
  type BodyForm,
  type BodyObjective,
  type GoalSuggestion,
  type GoalsErrors,
  type GoalsForm,
  type GoalsInput,
} from '@fatia/api-client';
import { useAuth } from '@/auth/auth-context';
import { Button, Input, Label, LoadingState } from '@/components/ui';
import { hojeIso, mensagemDeErro } from '@/components/nutrition/helpers';
import { cores } from '@/theme/cores';

const kcal = (n: number) => n.toLocaleString('pt-BR');

/**
 * Réplica de `apps/web/src/components/onboarding/onboarding-wizard.tsx`: mesmos
 * passos, opções e faixas (de `@fatia/api-client`), e a conta é da API.
 *
 * Fora do grupo `(app)`, sem a barra de navegação. A data de nascimento é
 * digitada com máscara (DD/MM/AAAA): um seletor nativo seria dependência nova
 * para um campo que se preenche uma vez.
 */
export default function OnboardingScreen() {
  const { status } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { refazer } = useLocalSearchParams<{ refazer?: string }>();
  const redo = refazer === '1';

  const [passo, setPasso] = useState(0);
  const [objetivo, setObjetivo] = useState<BodyObjective | null>(null);
  const [atividade, setAtividade] = useState<ActivityLevel | null>(null);
  const [corpo, setCorpo] = useState<BodyForm | null>(null);
  const [errosDoCorpo, setErrosDoCorpo] = useState<BodyErrors>({});
  const [sugestao, setSugestao] = useState<GoalSuggestion | null>(null);
  const [metas, setMetas] = useState<GoalsForm | null>(null);
  const [errosDasMetas, setErrosDasMetas] = useState<GoalsErrors>({});

  useEffect(() => {
    if (status === 'signedOut') router.replace('/login');
  }, [status, router]);

  const logado = status === 'signedIn';
  const eu = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => usersApi.me(),
    enabled: logado,
  });
  const pesos = useQuery({
    queryKey: ['progress', 'weights', 'latest'],
    queryFn: () => progressApi.listWeights(),
    enabled: logado,
  });

  // Preenche uma vez; o que a pessoa digitar depois manda. A data fica em
  // DD/MM/AAAA no campo e só vira ISO na hora de validar.
  if (eu.isFetched && pesos.isFetched && corpo === null) {
    const inicial = initialBodyForm(eu.data, pesos.data?.logs[0]?.weightKg ?? null);
    setCorpo({ ...inicial, birthDate: isoToBrDate(inicial.birthDate) });
    // Só se ainda não há escolha: um toque feito antes do perfil chegar manda.
    const salvo = eu.data;
    if (salvo?.objective) setObjetivo((atual) => atual ?? salvo.objective);
    if (salvo?.activityLevel) setAtividade((atual) => atual ?? salvo.activityLevel);
  }

  const corpoValido = () =>
    bodyFromForm({ ...corpo!, birthDate: brDateToIso(corpo!.birthDate) }, hojeIso());

  const concluir = () => {
    void qc.invalidateQueries({ queryKey: ['users', 'me'] });
    if (redo) router.back();
    else router.replace('/');
  };

  const sugerir = useMutation({
    mutationFn: () => {
      const r = corpoValido();
      if (!r.ok) throw new Error('Confira os seus dados.');
      return nutritionApi.suggestGoals({
        ...r.body,
        objective: objetivo!,
        activityLevel: atividade!,
      });
    },
    onSuccess: (s) => {
      setSugestao(s);
      setMetas(goalsToForm(s.goals));
      setErrosDasMetas({});
      setPasso(3);
    },
  });

  const salvar = useMutation({
    mutationFn: (aceitas: GoalsInput) => {
      const r = corpoValido();
      if (!r.ok) throw new Error('Confira os seus dados.');
      return usersApi.completeOnboarding({
        ...r.body,
        objective: objetivo!,
        activityLevel: atividade!,
        goals: aceitas,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nutrition'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['progress'] });
      concluir();
    },
  });

  const pular = useMutation({ mutationFn: () => usersApi.skipOnboarding(), onSuccess: concluir });

  if (!logado || !corpo) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <LoadingState label="" />
      </View>
    );
  }

  const avancar = () => {
    if (passo === 1) {
      const r = corpoValido();
      if (!r.ok) {
        setErrosDoCorpo(r.errors);
        return;
      }
      setErrosDoCorpo({});
    }
    if (passo === 2) {
      sugerir.mutate();
      return;
    }
    setPasso((p) => p + 1);
  };

  const usarMetas = () => {
    const r = goalsFromForm(metas!);
    if (!r.ok) {
      setErrosDasMetas(r.errors);
      return;
    }
    setErrosDasMetas({});
    salvar.mutate(r.goals);
  };

  const podeAvancar =
    (passo === 0 && objetivo !== null) || passo === 1 || (passo === 2 && atividade !== null);
  const erro = sugerir.error ?? salvar.error ?? pular.error;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-6 px-5">
          <View className="gap-4">
            <View className="flex-row items-center gap-2">
              {passo > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Voltar"
                  onPress={() => setPasso((p) => p - 1)}
                  className="h-11 w-11 items-center justify-center rounded-full"
                >
                  <ChevronLeft size={22} color={cores.mutedForeground} />
                </Pressable>
              ) : (
                <View className="h-11 w-11" />
              )}
              <View
                accessibilityRole="progressbar"
                accessibilityLabel={`Passo ${passo + 1} de ${ONBOARDING_STEPS.length}`}
                className="flex-1 flex-row gap-1.5"
              >
                {ONBOARDING_STEPS.map((s, i) => (
                  <View
                    key={s.key}
                    className={`h-1.5 flex-1 rounded-full ${i <= passo ? 'bg-primary' : 'bg-secondary'}`}
                  />
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => (redo ? router.back() : pular.mutate())}
                disabled={pular.isPending}
                className="min-h-11 justify-center px-3"
              >
                <Text className="text-sm font-semibold text-muted-foreground">
                  {redo ? 'Cancelar' : 'Pular por agora'}
                </Text>
              </Pressable>
            </View>
            <Text accessibilityRole="header" className="text-2xl font-extrabold text-foreground">
              {ONBOARDING_STEPS[passo].title}
            </Text>
          </View>

          {passo === 0 ? (
            <Escolhas opcoes={OBJECTIVE_OPTIONS} valor={objetivo} onChange={setObjetivo} />
          ) : null}
          {passo === 1 ? (
            <PassoDoCorpo corpo={corpo} erros={errosDoCorpo} onChange={setCorpo} />
          ) : null}
          {passo === 2 ? (
            <Escolhas opcoes={ACTIVITY_OPTIONS} valor={atividade} onChange={setAtividade} />
          ) : null}
          {passo === 3 && sugestao && metas ? (
            <PassoDasMetas
              sugestao={sugestao}
              metas={metas}
              erros={errosDasMetas}
              onChange={setMetas}
            />
          ) : null}

          {erro ? (
            <Text accessibilityRole="alert" className="text-sm text-destructive">
              {mensagemDeErro(erro)}
            </Text>
          ) : null}

          {passo < 3 ? (
            <Button
              size="lg"
              onPress={avancar}
              disabled={!podeAvancar || sugerir.isPending}
              loading={sugerir.isPending}
            >
              {passo === 2 ? 'Calcular minhas metas' : 'Continuar'}
            </Button>
          ) : (
            <Button
              size="lg"
              onPress={usarMetas}
              disabled={salvar.isPending}
              loading={salvar.isPending}
            >
              Usar estas metas
            </Button>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Escolhas<T extends string>({
  opcoes,
  valor,
  onChange,
}: {
  opcoes: { value: T; label: string; description: string }[];
  valor: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" className="gap-3">
      {opcoes.map((o) => {
        const marcado = o.value === valor;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: marcado }}
            accessibilityLabel={`${o.label}. ${o.description}`}
            onPress={() => onChange(o.value)}
            className={`gap-1 rounded-2xl border bg-card px-4 py-4 ${marcado ? 'border-primary' : 'border-border'}`}
          >
            <Text className="text-base font-bold text-foreground">{o.label}</Text>
            <Text className="text-sm text-muted-foreground">{o.description}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Campo({ rotulo, erro, children }: { rotulo: string; erro?: string; children: ReactNode }) {
  return (
    <View className="flex-1 gap-1.5">
      <Label>{rotulo}</Label>
      {children}
      {erro ? <Text className="text-xs text-destructive">{erro}</Text> : null}
    </View>
  );
}

function PassoDoCorpo({
  corpo,
  erros,
  onChange,
}: {
  corpo: BodyForm;
  erros: BodyErrors;
  onChange: (c: BodyForm) => void;
}) {
  const alterar = (patch: Partial<BodyForm>) => onChange({ ...corpo, ...patch });
  return (
    <View className="gap-5">
      <Text className="text-sm text-muted-foreground">
        Usados só para estimar quanto o seu corpo gasta. Ninguém mais vê.
      </Text>
      <View className="gap-2">
        <Label>Sexo biológico</Label>
        <View accessibilityRole="radiogroup" className="flex-row gap-3">
          {SEX_OPTIONS.map((o) => (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: corpo.sex === o.value }}
              onPress={() => alterar({ sex: o.value })}
              className={`h-12 flex-1 items-center justify-center rounded-xl border bg-card ${corpo.sex === o.value ? 'border-primary' : 'border-border'}`}
            >
              <Text className="text-sm font-semibold text-foreground">{o.label}</Text>
            </Pressable>
          ))}
        </View>
        {erros.sex ? <Text className="text-xs text-destructive">{erros.sex}</Text> : null}
      </View>
      <Campo rotulo="Data de nascimento" erro={erros.birthDate}>
        <Input
          accessibilityLabel="Data de nascimento"
          placeholder="DD/MM/AAAA"
          keyboardType="number-pad"
          value={corpo.birthDate}
          onChangeText={(t) => alterar({ birthDate: maskBrDate(t) })}
        />
      </Campo>
      <View className="flex-row gap-3">
        <Campo rotulo="Altura (cm)" erro={erros.heightCm}>
          <Input
            accessibilityLabel="Altura (cm)"
            keyboardType="decimal-pad"
            value={corpo.heightCm}
            onChangeText={(t) => alterar({ heightCm: t })}
          />
        </Campo>
        <Campo rotulo="Peso (kg)" erro={erros.weightKg}>
          <Input
            accessibilityLabel="Peso (kg)"
            keyboardType="decimal-pad"
            value={corpo.weightKg}
            onChangeText={(t) => alterar({ weightKg: t })}
          />
        </Campo>
      </View>
    </View>
  );
}

function PassoDasMetas({
  sugestao,
  metas,
  erros,
  onChange,
}: {
  sugestao: GoalSuggestion;
  metas: GoalsForm;
  erros: GoalsErrors;
  onChange: (m: GoalsForm) => void;
}) {
  const campo = (chave: keyof GoalsForm, rotulo: string, nome = rotulo) => (
    <Campo rotulo={rotulo} erro={erros[chave]}>
      <Input
        accessibilityLabel={nome}
        keyboardType="number-pad"
        value={metas[chave]}
        onChangeText={(t) => onChange({ ...metas, [chave]: t })}
      />
    </Campo>
  );
  return (
    <View className="gap-5">
      <View className="gap-2 rounded-2xl border border-border bg-card p-4">
        <Text className="text-xs font-bold text-muted-foreground">SEU GASTO ESTIMADO</Text>
        <Text className="text-3xl font-extrabold text-foreground">
          {kcal(sugestao.tdee)} <Text className="text-base font-semibold">kcal/dia</Text>
        </Text>
        <Text className="text-sm text-muted-foreground">
          Para o seu objetivo, a sugestão é em torno de {kcal(sugestao.targetKcal)} kcal. É um ponto
          de partida: ajuste o que quiser, e reveja daqui a umas semanas.
        </Text>
      </View>
      {GOAL_RANGES.map((r) => (
        <View key={r.min} className="gap-2">
          <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">
            {r.label} ({r.unit} por dia)
          </Text>
          <View className="flex-row gap-3">
            {campo(r.min, 'Mínimo', `${r.label}: mínimo`)}
            {campo(r.max, 'Máximo', `${r.label}: máximo`)}
          </View>
        </View>
      ))}
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">
          Atividade e hidratação
        </Text>
        <View className="flex-row gap-3">
          {GOAL_SINGLES.map((s) => (
            <View key={s.key} className="flex-1">
              {campo(s.key, s.label)}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
