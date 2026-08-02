import { useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nutritionApi, type UserGoals } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, ErrorState, Input, Label, LoadingState } from '@/components/ui';
import { mensagemDeErro } from '@/components/nutrition/helpers';

/**
 * Réplica de `apps/web/src/app/(app)/nutrition/goals/page.tsx`.
 *
 * Os mesmos campos, os mesmos valores iniciais e a mesma divisão em blocos. O
 * que muda é o teclado: cada campo abre o numérico, porque digitar meta calórica
 * no teclado alfabético é o tipo de atrito que faz a pessoa desistir do
 * formulário.
 */

type Formulario = Omit<UserGoals, 'userId'>;

const VAZIO: Formulario = {
  kcalMin: 1800,
  kcalMax: 2200,
  proteinMinG: 120,
  proteinMaxG: 160,
  carbsMinG: 180,
  carbsMaxG: 250,
  fatMinG: 50,
  fatMaxG: 80,
  weeklyWorkouts: 3,
  dailyStepsTarget: 8000,
  dailyWaterTargetMl: 2500,
};

export default function NutritionGoalsScreen() {
  const qc = useQueryClient();
  const metas = useQuery({ queryKey: ['nutrition', 'goals'], queryFn: () => nutritionApi.goals() });
  const [formulario, setFormulario] = useState<Formulario>(VAZIO);
  const [salvo, setSalvo] = useState(false);

  // Ajuste durante o render, e não num efeito (#187). A comparação é a mesma que
  // estava no array de dependências — identidade do objeto do React Query, que
  // só muda quando a resposta muda de verdade (structural sharing) — então o
  // formulário é reespelhado nos mesmos momentos, só que antes de pintar.
  // `dadosAnteriores` parte de `undefined` para reproduzir a passagem de
  // montagem, que é o caso normal: a resposta já em cache tem de preencher os
  // campos.
  const [dadosAnteriores, setDadosAnteriores] = useState<typeof metas.data>(undefined);
  if (dadosAnteriores !== metas.data && metas.data) {
    setDadosAnteriores(metas.data);
    const { userId, ...resto } = metas.data;
    // `userId` volta da API mas não é editável e não vai no PUT.
    void userId;
    setFormulario(resto);
  }

  const salvar = useMutation({
    mutationFn: (corpo: Formulario) => nutritionApi.putGoals(corpo),
    onSuccess: () => {
      setSalvo(true);
      void qc.invalidateQueries({ queryKey: ['nutrition', 'goals'] });
    },
  });

  const alterar = (campo: keyof Formulario, valor: string) => {
    setSalvo(false);
    // Campo vazio vira 0 e não NaN — `NaN` no `value` deixa o input em branco e
    // a pessoa não entende por que o botão salva um valor que ela não vê.
    const numero = Number(valor.replace(',', '.'));
    setFormulario((anterior) => ({
      ...anterior,
      [campo]: Number.isFinite(numero) ? numero : 0,
    }));
  };

  const campo = (chave: keyof Formulario, rotulo: string) => (
    <View className="flex-1 gap-1">
      <Label>{rotulo}</Label>
      <Input
        accessibilityLabel={rotulo}
        keyboardType="numeric"
        inputMode="numeric"
        value={String(formulario[chave])}
        onChangeText={(valor) => alterar(chave, valor)}
      />
    </View>
  );

  return (
    <Screen
      back
      title="Metas"
      onRefresh={() => void metas.refetch()}
      refreshing={metas.isRefetching}
    >
      <View className="gap-4 p-4">
        {metas.isLoading ? <LoadingState label="Carregando metas…" /> : null}
        {metas.error ? (
          <ErrorState error={metas.error} onRetry={() => void metas.refetch()} />
        ) : null}

        <Grupo titulo="Calorias (kcal/dia)">
          {campo('kcalMin', 'Mínimo')}
          {campo('kcalMax', 'Máximo')}
        </Grupo>

        <Grupo titulo="Proteína (g/dia)">
          {campo('proteinMinG', 'Mínimo')}
          {campo('proteinMaxG', 'Máximo')}
        </Grupo>

        <Grupo titulo="Carboidratos (g/dia)">
          {campo('carbsMinG', 'Mínimo')}
          {campo('carbsMaxG', 'Máximo')}
        </Grupo>

        <Grupo titulo="Gordura (g/dia)">
          {campo('fatMinG', 'Mínimo')}
          {campo('fatMaxG', 'Máximo')}
        </Grupo>

        <Grupo titulo="Atividade">
          {campo('weeklyWorkouts', 'Treinos/semana')}
          {campo('dailyStepsTarget', 'Passos/dia')}
        </Grupo>

        <Grupo titulo="Hidratação">{campo('dailyWaterTargetMl', 'Água/dia (ml)')}</Grupo>

        <Button
          onPress={() => salvar.mutate(formulario)}
          disabled={salvar.isPending}
          loading={salvar.isPending}
        >
          Salvar metas
        </Button>

        {salvar.error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {mensagemDeErro(salvar.error, {
              conflito: 'Suas metas já foram atualizadas.',
              alternativa: 'Não foi possível salvar as metas. Tente de novo.',
            })}
          </Text>
        ) : null}

        {salvo && !salvar.isPending && !salvar.error ? (
          <Text accessibilityRole="alert" className="text-sm text-primary">
            Metas salvas.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <Text accessibilityRole="header" className="text-sm font-medium text-foreground">
        {titulo}
      </Text>
      <View className="flex-row gap-3">{children}</View>
    </View>
  );
}
