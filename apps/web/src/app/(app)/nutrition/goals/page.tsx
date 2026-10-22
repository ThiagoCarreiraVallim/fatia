'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Calculator } from 'lucide-react';
import { nutritionApi, type UserGoals } from '@fatia/api-client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadError } from '@/components/nutrition/load-error';
import { errorMessage } from '@/components/nutrition/error-message';

type FormState = Omit<UserGoals, 'userId'>;

const empty: FormState = {
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

export default function GoalsPage() {
  const qc = useQueryClient();
  const goals = useQuery({ queryKey: ['nutrition', 'goals'], queryFn: () => nutritionApi.goals() });
  const [form, setForm] = useState<FormState>(empty);
  // Como no app: sem um "salvo", o botão voltava ao normal e a pessoa não sabia
  // se tinha gravado. Mexer num campo apaga o aviso.
  const [saved, setSaved] = useState(false);

  // Ajuste durante o render, e não num efeito (#187). A comparação é a mesma que
  // estava no array de dependências — identidade do objeto do React Query, que
  // só muda quando a resposta muda de verdade (structural sharing) — então o
  // formulário é reespelhado nos mesmos momentos, só que antes de pintar.
  // `previousData` parte de `undefined` para reproduzir a passagem de montagem,
  // que é o caso normal: a resposta já em cache tem de preencher os campos.
  const [previousData, setPreviousData] = useState<typeof goals.data>(undefined);
  if (previousData !== goals.data && goals.data) {
    setPreviousData(goals.data);
    const { userId: _userId, ...rest } = goals.data;
    void _userId;
    setForm(rest);
  }

  const save = useMutation({
    mutationFn: (body: FormState) => nutritionApi.putGoals(body),
    onSuccess: () => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ['nutrition', 'goals'] });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(form);
  };

  const field = (key: keyof FormState, label: string) => (
    <div className="space-y-1">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type="number"
        inputMode="numeric"
        min={0}
        value={form[key]}
        onChange={(e) => {
          setSaved(false);
          setForm((f) => ({ ...f, [key]: Number(e.target.value) }));
        }}
      />
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-4">
      <Link
        href="/onboarding?refazer=1"
        className="flex min-h-12 items-center gap-3 rounded-xl border border-subtle bg-card px-4 py-3 text-sm hover:bg-card/80"
      >
        <Calculator size={18} className="text-primary" aria-hidden />
        <span className="flex-1">
          <span className="block font-semibold">Recalcular com meus dados</span>
          <span className="block text-xs text-muted-foreground">
            Objetivo, peso e rotina viram uma sugestão de metas.
          </span>
        </span>
      </Link>

      {goals.isLoading && <Skeleton className="h-16" />}
      {goals.error && <LoadError error={goals.error} onRetry={() => void goals.refetch()} />}

      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="col-span-2 text-sm font-medium">Calorias (kcal/dia)</legend>
        {field('kcalMin', 'Mínimo')}
        {field('kcalMax', 'Máximo')}
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="col-span-2 text-sm font-medium">Proteína (g/dia)</legend>
        {field('proteinMinG', 'Mínimo')}
        {field('proteinMaxG', 'Máximo')}
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="col-span-2 text-sm font-medium">Carboidratos (g/dia)</legend>
        {field('carbsMinG', 'Mínimo')}
        {field('carbsMaxG', 'Máximo')}
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="col-span-2 text-sm font-medium">Gordura (g/dia)</legend>
        {field('fatMinG', 'Mínimo')}
        {field('fatMaxG', 'Máximo')}
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="col-span-2 text-sm font-medium">Atividade</legend>
        {field('weeklyWorkouts', 'Treinos/semana')}
        {field('dailyStepsTarget', 'Passos/dia')}
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="col-span-2 text-sm font-medium">Hidratação</legend>
        {field('dailyWaterTargetMl', 'Água/dia (ml)')}
      </fieldset>

      <Button type="submit" disabled={save.isPending} className="w-full">
        {save.isPending ? 'Salvando…' : 'Salvar metas'}
      </Button>
      {save.error && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(save.error, {
            conflict: 'Suas metas já foram atualizadas.',
            fallback: 'Não foi possível salvar as metas. Tente de novo.',
          })}
        </p>
      )}
      {saved && !save.isPending && !save.error && (
        <p role="status" className="text-sm text-primary">
          Metas salvas.
        </p>
      )}
    </form>
  );
}
