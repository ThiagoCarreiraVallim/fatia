'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { nutritionApi, type UserGoals } from '@/lib/api/nutrition';
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
};

export default function GoalsPage() {
  const qc = useQueryClient();
  const goals = useQuery({ queryKey: ['nutrition', 'goals'], queryFn: () => nutritionApi.goals() });
  const [form, setForm] = useState<FormState>(empty);

  useEffect(() => {
    if (goals.data) {
      const { userId: _userId, ...rest } = goals.data;
      void _userId;
      setForm(rest);
    }
  }, [goals.data]);

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

      <Button type="submit" disabled={save.isPending} className="w-full">
        {save.isPending ? 'Salvando…' : 'Salvar metas'}
      </Button>
      {save.error && <p className="text-sm text-rose-500">{(save.error as Error).message}</p>}
    </form>
  );
}
