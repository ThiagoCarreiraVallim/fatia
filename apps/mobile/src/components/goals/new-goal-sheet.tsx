import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GOAL_KIND_OPTIONS,
  goalAutoText,
  goalCreateInput,
  goalDeadlineChoices,
  goalKindOption,
  goalsApi,
  localDateKey,
  parseDayInput,
  type GoalDeadlineChoice,
  type GoalKind,
} from '@fatia/api-client';
import type { IconName } from '@fatia/design';
import {
  Button,
  Drawer,
  DrawerContent,
  cn,
  DrawerFooter,
  DrawerHeader,
  DrawerScrollView,
  DrawerTitle,
  FormMessage,
} from '@/components/ui';
import { Text } from '@/components/ui/text';
import { IconChip } from '@/components/progress/progress-ui';
import { SheetField } from '@/components/progress/sheet-field';
import { ValueStepper } from '@/components/progress/value-stepper';
import { parseAmount } from '@/components/progress/parse';

/**
 * Nova meta (prancha Al-G10, #382) — réplica de
 * `apps/web/src/components/goals/new-goal-sheet.tsx`. Sem calendário nativo no app, o
 * "Escolher" do prazo é uma data digitada (DD/MM/AAAA).
 */
export function NewGoalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<GoalKind>('weight');
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState(String(goalKindOption('weight').initialTarget));
  const [deadlineChoice, setDeadlineChoice] = useState<GoalDeadlineChoice>('none');
  const [typed, setTyped] = useState('');
  const [today] = useState(() => new Date());
  const option = goalKindOption(kind);
  const choices = goalDeadlineChoices(today);

  function reset() {
    setKind('weight');
    setTitle('');
    setUnit('');
    setTarget(String(goalKindOption('weight').initialTarget));
    setDeadlineChoice('none');
    setTyped('');
    create.reset();
  }

  const create = useMutation({
    mutationFn: (input: Parameters<typeof goalsApi.create>[0]) => goalsApi.create(input),
    onSuccess: () => {
      reset();
      onClose();
      return qc.invalidateQueries({ queryKey: ['goals'] });
    },
  });

  const value = parseAmount(target);
  const valid = value !== null && value > 0;
  const pickedDay = parseDayInput(typed);
  const pickedPast = pickedDay !== null && pickedDay < localDateKey(today);
  const deadline =
    deadlineChoice === 'year_end' ? choices[1]!.date : deadlineChoice === 'pick' ? pickedDay : null;
  const deadlineInvalid = deadlineChoice === 'pick' && (pickedDay === null || pickedPast);

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
      snapPoints={['85%']}
    >
      <DrawerContent className="px-4">
        <DrawerHeader className="px-0">
          <DrawerTitle className="font-display text-[22px] leading-[28px]">Nova meta</DrawerTitle>
        </DrawerHeader>
        <DrawerScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          <View className="gap-4 py-2">
            {/* O `.g2` da prancha: duas colunas, o tipo escolhido no verde da marca. */}
            <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
              {GOAL_KIND_OPTIONS.map((o) => (
                <View key={o.kind} style={{ width: '50%', padding: 4 }}>
                  <IconChip
                    icon={o.icon as IconName}
                    label={o.label}
                    selected={kind === o.kind}
                    tone="lime"
                    onPress={() => {
                      setKind(o.kind);
                      setTarget(String(o.initialTarget));
                    }}
                    className={kind === o.kind ? 'justify-start' : 'justify-start bg-transparent'}
                  />
                </View>
              ))}
            </View>
            <Text className="-mt-2 text-[13px] text-muted-foreground">{goalAutoText(kind)}</Text>

            <SheetField
              label="Título"
              value={title}
              onChangeText={setTitle}
              placeholder={option.placeholder}
              keyboardType="default"
              filled
            />

            {kind === 'custom' ? (
              <SheetField
                label="Unidade"
                value={unit}
                onChangeText={setUnit}
                placeholder="livros, km, vezes"
                keyboardType="default"
              />
            ) : null}

            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-[15px] text-muted-foreground">Alvo</Text>
              <ValueStepper
                label="Alvo"
                value={target}
                onChange={setTarget}
                step={option.step}
                decimals={option.step < 1 ? 1 : 0}
                base={option.initialTarget}
                unit={kind === 'custom' ? unit || option.unit : option.unit}
                size="sm"
              />
            </View>

            <View className="gap-1.5">
              <View className="flex-row items-center justify-between gap-2">
                <Text className="text-[15px] text-muted-foreground">Prazo</Text>
                <View className="flex-row gap-1.5">
                  {choices.map((c) => (
                    <IconChip
                      key={c.value}
                      label={c.label}
                      selected={deadlineChoice === c.value}
                      onPress={() => setDeadlineChoice(c.value)}
                      className={cn(
                        'min-h-[34px] px-3',
                        deadlineChoice !== c.value && 'bg-transparent',
                      )}
                    />
                  ))}
                </View>
              </View>
              {deadlineChoice === 'pick' ? (
                <SheetField
                  label="Data do prazo"
                  value={typed}
                  onChangeText={setTyped}
                  placeholder="DD/MM/AAAA"
                  keyboardType="numbers-and-punctuation"
                  error={
                    typed && pickedDay === null
                      ? 'Use o formato DD/MM/AAAA.'
                      : pickedPast
                        ? 'O prazo precisa ser hoje ou depois.'
                        : null
                  }
                />
              ) : null}
            </View>

            {create.isError ? <FormMessage>Não deu para criar. Tente de novo.</FormMessage> : null}
          </View>
        </DrawerScrollView>
        <DrawerFooter className="px-0 pb-8">
          <Button
            disabled={!valid || deadlineInvalid}
            loading={create.isPending}
            onPress={() =>
              value !== null &&
              create.mutate(goalCreateInput({ kind, title, target: value, deadline, unit }))
            }
          >
            Criar meta
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
