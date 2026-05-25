'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { goalsApi, type GoalKind } from '@/lib/api/goals';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface KindOption {
  kind: GoalKind;
  label: string;
  unit: string;
  hint: string;
  placeholder: string;
}

const KIND_OPTIONS: KindOption[] = [
  {
    kind: 'weight',
    label: 'Peso',
    unit: 'kg',
    hint: 'Atualiza automático a cada log de peso.',
    placeholder: 'ex: 75',
  },
  {
    kind: 'body_fat',
    label: '% de gordura',
    unit: '%',
    hint: 'Você reporta o valor atual via Claude ou aqui.',
    placeholder: 'ex: 12',
  },
  {
    kind: 'workout_frequency',
    label: 'Treinos / semana',
    unit: 'treinos/semana',
    hint: 'Contagem automática dos últimos 7 dias.',
    placeholder: 'ex: 5',
  },
  {
    kind: 'step_count',
    label: 'Passos / dia (média)',
    unit: 'passos',
    hint: 'Média automática dos últimos 7 dias.',
    placeholder: 'ex: 10000',
  },
  {
    kind: 'custom',
    label: 'Custom',
    unit: 'pontos',
    hint: 'Métrica livre — você reporta o valor.',
    placeholder: '',
  },
];

export function NewGoalDrawer({ open, onClose }: Props) {
  const [kind, setKind] = useState<GoalKind>('weight');
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('kg');
  const [deadline, setDeadline] = useState('');
  const qc = useQueryClient();

  const selected = KIND_OPTIONS.find((k) => k.kind === kind)!;

  const reset = () => {
    setKind('weight');
    setTitle('');
    setTarget('');
    setUnit('kg');
    setDeadline('');
  };

  const mutation = useMutation({
    mutationFn: () => {
      const t = Number(target);
      if (!title.trim()) throw new Error('Dê um título à meta.');
      if (!Number.isFinite(t)) throw new Error('Valor alvo inválido.');
      if (!unit.trim()) throw new Error('Informe a unidade.');
      return goalsApi.create({
        kind,
        title: title.trim(),
        targetValue: t,
        unit: unit.trim(),
        ...(deadline && { deadline: new Date(deadline).toISOString() }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      reset();
      onClose();
    },
  });

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Nova meta</DrawerTitle>
          <DrawerDescription>
            Defina uma meta pessoal. Você também pode criar pelo Claude.
          </DrawerDescription>
        </DrawerHeader>

        <div className="my-3 space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Tipo</p>
            <div className="grid grid-cols-2 gap-2">
              {KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.kind}
                  type="button"
                  onClick={() => {
                    setKind(opt.kind);
                    setUnit(opt.unit);
                  }}
                  className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition-colors ${
                    kind === opt.kind
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-white/10 bg-card text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="pt-1 text-[11px] text-muted-foreground">{selected.hint}</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="goal-title" className="text-sm font-medium">
              Título
            </label>
            <Input
              id="goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex: Baixar para 12% de BF"
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="goal-target" className="text-sm font-medium">
                Alvo
              </label>
              <Input
                id="goal-target"
                type="number"
                inputMode="decimal"
                step="0.1"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={selected.placeholder}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="goal-unit" className="text-sm font-medium">
                Unidade
              </label>
              <Input
                id="goal-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                maxLength={30}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="goal-deadline" className="text-sm font-medium">
              Prazo (opcional)
            </label>
            <Input
              id="goal-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          {mutation.error && (
            <p className="text-sm text-rose-500">{(mutation.error as Error).message}</p>
          )}

          <Button
            className="w-full"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Salvando…' : 'Criar meta'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
