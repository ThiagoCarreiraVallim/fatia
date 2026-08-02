'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { nutritionApi, type UserGoals } from '@fatia/api-client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nutrition', 'goals'] }),
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
        min={0}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
      />
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-4">
      <header className="flex items-center gap-2">
        <Link href="/nutrition" className="rounded p-1 hover:bg-accent" aria-label="Voltar">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-xl font-semibold">Metas</h1>
      </header>

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
      {save.error && <p className="text-sm text-rose-500">{(save.error as Error).message}</p>}
    </form>
  );
}
