'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GOAL_KIND_OPTIONS,
  goalAutoText,
  goalCreateInput,
  goalDeadlineChoices,
  goalKindOption,
  goalsApi,
  localDateKey,
  type GoalDeadlineChoice,
  type GoalKind,
} from '@fatia/api-client';
import type { IconName } from '@fatia/design';
import { ValueStepper } from '@/components/progress/value-stepper';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';

/**
 * Nova meta (prancha Al-G10, #382): o tipo, o título (sugerido se ficar vazio), o alvo com
 * − e + (e digitável) e o prazo. Peso, treinos e passos atualizam sozinhos.
 */
export function NewGoalSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<GoalKind>('weight');
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState(String(goalKindOption('weight').initialTarget));
  const [deadlineChoice, setDeadlineChoice] = useState<GoalDeadlineChoice>('none');
  const [picked, setPicked] = useState('');
  const [today] = useState(() => new Date());
  const option = goalKindOption(kind);
  const choices = goalDeadlineChoices(today);

  function reset() {
    setKind('weight');
    setTitle('');
    setUnit('');
    setTarget(String(goalKindOption('weight').initialTarget));
    setDeadlineChoice('none');
    setPicked('');
    create.reset();
  }

  const create = useMutation({
    mutationFn: (input: Parameters<typeof goalsApi.create>[0]) => goalsApi.create(input),
    onSuccess: () => {
      reset();
      onOpenChange(false);
      return qc.invalidateQueries({ queryKey: ['goals'] });
    },
  });

  const value = Number(target.replace(',', '.'));
  const valid = target.trim() !== '' && Number.isFinite(value) && value > 0;
  const deadline =
    deadlineChoice === 'year_end'
      ? choices[1]!.date
      : deadlineChoice === 'pick'
        ? picked || null
        : null;
  const deadlineMissing = deadlineChoice === 'pick' && !picked;

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Nova meta</DrawerTitle>
          <DrawerDescription>{goalAutoText(kind)}</DrawerDescription>
        </DrawerHeader>
        <div data-vaul-no-drag className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
          <div className="flex flex-wrap gap-2">
            {GOAL_KIND_OPTIONS.map((o) => (
              <Chip
                key={o.kind}
                selected={kind === o.kind}
                onClick={() => {
                  setKind(o.kind);
                  setTarget(String(o.initialTarget));
                }}
              >
                <Icon name={o.icon as IconName} size={16} />
                {o.label}
              </Chip>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="goal-title" className="text-sm font-medium">
              Título
            </label>
            <Input
              id="goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={option.placeholder}
              maxLength={120}
            />
          </div>

          {kind === 'custom' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="goal-unit" className="text-sm font-medium">
                Unidade
              </label>
              <Input
                id="goal-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="livros, km, vezes"
                maxLength={24}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium" aria-hidden>
              Alvo
            </span>
            <ValueStepper
              id="goal-target"
              label="Alvo"
              value={target}
              onChange={setTarget}
              step={option.step}
              decimals={option.step < 1 ? 1 : 0}
              base={option.initialTarget}
              unit={kind === 'custom' ? unit || option.unit : option.unit}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Prazo</span>
            <div className="flex flex-wrap gap-2">
              {choices.map((c) => (
                <Chip
                  key={c.value}
                  selected={deadlineChoice === c.value}
                  onClick={() => setDeadlineChoice(c.value)}
                >
                  {c.label}
                </Chip>
              ))}
            </div>
            {deadlineChoice === 'pick' && (
              <>
                <label htmlFor="goal-deadline-pick" className="sr-only">
                  Data do prazo
                </label>
                <Input
                  id="goal-deadline-pick"
                  type="date"
                  min={localDateKey(today)}
                  value={picked}
                  onChange={(e) => setPicked(e.target.value)}
                />
              </>
            )}
          </div>

          {create.isError && (
            <p className="text-sm text-danger">Não deu para criar. Tente de novo.</p>
          )}

          <Button
            disabled={!valid || deadlineMissing || create.isPending}
            onClick={() =>
              create.mutate(goalCreateInput({ kind, title, target: value, deadline, unit }))
            }
          >
            {create.isPending ? 'Criando...' : 'Criar meta'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
