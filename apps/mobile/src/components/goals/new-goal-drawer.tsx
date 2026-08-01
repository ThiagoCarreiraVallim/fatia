import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { goalsApi, type GoalKind } from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerScrollView,
  DrawerTextInput,
  DrawerTitle,
  FormMessage,
  Label,
  cn,
} from '@/components/ui';

interface KindOption {
  kind: GoalKind;
  label: string;
  unit: string;
  hint: string;
  placeholder: string;
}

/** Mesmas opções, rótulos e dicas do `NewGoalDrawer` do PWA. */
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

const SHEET_INPUT_CLASS =
  'min-h-[44px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground';

/**
 * O PWA usa `<input type="date">`, que o React Native não tem — e um seletor
 * nativo exigiria dependência nova. O campo é texto com formato explícito, e a
 * validação abaixo é o que impede um `Invalid Date` chegar à API.
 */
function parseDeadline(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const invalid = new Error('Prazo inválido. Use o formato AAAA-MM-DD.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) throw invalid;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) throw invalid;
  return date.toISOString();
}

export function NewGoalDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<GoalKind>('weight');
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('kg');
  const [deadline, setDeadline] = useState('');
  const qc = useQueryClient();

  const selected = KIND_OPTIONS.find((option) => option.kind === kind) ?? KIND_OPTIONS[0];

  const reset = () => {
    setKind('weight');
    setTitle('');
    setTarget('');
    setUnit('kg');
    setDeadline('');
  };

  const mutation = useMutation({
    mutationFn: () => {
      const value = Number(target);
      if (!title.trim()) throw new Error('Dê um título à meta.');
      if (!Number.isFinite(value)) throw new Error('Valor alvo inválido.');
      if (!unit.trim()) throw new Error('Informe a unidade.');
      const isoDeadline = parseDeadline(deadline);
      return goalsApi.create({
        kind,
        title: title.trim(),
        targetValue: value,
        unit: unit.trim(),
        ...(isoDeadline && { deadline: isoDeadline }),
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
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
      // Altura fixa em vez de dinâmica: com o teclado aberto o formulário passa
      // da tela, e sem ponto de parada o conteúdo do fim (botão de criar) fica
      // fora de alcance.
      snapPoints={['85%']}
    >
      <DrawerHeader>
        <DrawerTitle>Nova meta</DrawerTitle>
        <DrawerDescription>
          Defina uma meta pessoal. Você também pode criar pelo Claude.
        </DrawerDescription>
      </DrawerHeader>

      <DrawerScrollView
        // `flex-1` é o que faz a lista dividir a altura fixa do sheet com o
        // cabeçalho e o rodapé; sem isso ela cresce até o tamanho do conteúdo e
        // o excedente é cortado pelo `overflow: hidden` do sheet.
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 32, gap: 16, paddingTop: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-1.5">
          <Label>Tipo</Label>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            {KIND_OPTIONS.map((option) => {
              const active = kind === option.kind;
              return (
                <Pressable
                  key={option.kind}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={option.label}
                  onPress={() => {
                    setKind(option.kind);
                    setUnit(option.unit);
                  }}
                  className={cn(
                    'min-h-[44px] w-[48%] justify-center rounded-xl border px-3 py-2',
                    active ? 'border-primary bg-accent' : 'border-border bg-card',
                  )}
                >
                  <Text
                    className={cn(
                      'text-xs font-bold',
                      active ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text className="pt-1 text-[11px] text-muted-foreground">{selected.hint}</Text>
        </View>

        <View className="gap-1.5">
          <Label>Título</Label>
          <DrawerTextInput
            accessibilityLabel="Título da meta"
            value={title}
            onChangeText={setTitle}
            placeholder="ex: Baixar para 12% de BF"
            placeholderTextColor="#8a8a8a"
            selectionColor="#2ce500"
            maxLength={120}
            className={SHEET_INPUT_CLASS}
          />
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 gap-1.5">
            <Label>Alvo</Label>
            <DrawerTextInput
              accessibilityLabel="Valor alvo"
              value={target}
              onChangeText={setTarget}
              keyboardType="decimal-pad"
              placeholder={selected.placeholder}
              placeholderTextColor="#8a8a8a"
              selectionColor="#2ce500"
              className={SHEET_INPUT_CLASS}
            />
          </View>
          <View className="flex-1 gap-1.5">
            <Label>Unidade</Label>
            <DrawerTextInput
              accessibilityLabel="Unidade"
              value={unit}
              onChangeText={setUnit}
              maxLength={30}
              placeholderTextColor="#8a8a8a"
              selectionColor="#2ce500"
              className={SHEET_INPUT_CLASS}
            />
          </View>
        </View>

        <View className="gap-1.5">
          <Label>Prazo (opcional)</Label>
          <DrawerTextInput
            accessibilityLabel="Prazo"
            accessibilityHint="Formato ano-mês-dia, por exemplo 2026-12-31"
            value={deadline}
            onChangeText={setDeadline}
            keyboardType="numbers-and-punctuation"
            placeholder="AAAA-MM-DD"
            placeholderTextColor="#8a8a8a"
            selectionColor="#2ce500"
            maxLength={10}
            className={SHEET_INPUT_CLASS}
          />
        </View>

        <FormMessage>{mutation.error?.message}</FormMessage>
      </DrawerScrollView>

      <DrawerFooter className="pb-8">
        <Button className="w-full" loading={mutation.isPending} onPress={() => mutation.mutate()}>
          {mutation.isPending ? 'Salvando…' : 'Criar meta'}
        </Button>
      </DrawerFooter>
    </Drawer>
  );
}
