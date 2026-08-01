import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { getRpeInfo, workoutApi, type SessionSet } from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  FormMessage,
} from '@/components/ui';

/**
 * `apps/web/src/components/workout/rpe-modal.tsx` — que no PWA já é um drawer do
 * `vaul`, então aqui vira bottom sheet e não `Alert`: são cinco opções com
 * emoji, e `Alert` do sistema só comporta texto e três botões.
 *
 * Montado pela tela dentro de `<DrawerLayer>`, nunca dentro do card: o sheet
 * nativo não é portal e abriria com a altura do card (ver `ui/drawer.tsx`).
 */

const RPE_VALUES = [6, 7, 8, 9, 10] as const;

export function RpeDrawer({
  open,
  onOpenChange,
  sessionId,
  set,
  onConfirmed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  set: SessionSet | null;
  onConfirmed?: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (open) setSelected(set?.rpe ?? null);
  }, [open, set?.rpe]);

  const save = useMutation({
    mutationFn: (rpe: number) => {
      if (!set) throw new Error('Sem série selecionada');
      return workoutApi.updateSet(sessionId, set.id, { rpe });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
      setSelected(null);
      onConfirmed?.();
      onOpenChange(false);
    },
  });

  function skip() {
    setSelected(null);
    onConfirmed?.();
    onOpenChange(false);
  }

  const info = getRpeInfo(selected);

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSelected(null);
          onConfirmed?.();
        }
        onOpenChange(next);
      }}
    >
      <DrawerContent className="px-4">
        <DrawerHeader className="px-0">
          <DrawerTitle>Como foi a série?</DrawerTitle>
          <DrawerDescription>
            Avalie o esforço percebido (RPE) — isso ajuda a calibrar os próximos treinos.
          </DrawerDescription>
        </DrawerHeader>

        <View className="mt-2 flex-row gap-2">
          {RPE_VALUES.map((value) => {
            const option = getRpeInfo(value);
            if (!option) return null;
            const active = selected === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`RPE ${value}, ${option.label}. ${option.hint}`}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setSelected(value);
                }}
                className={`min-h-[72px] flex-1 items-center justify-center gap-1 rounded-2xl border ${
                  active ? 'border-primary bg-accent' : 'border-border bg-card'
                }`}
              >
                <Text className="text-3xl leading-none">{option.emoji}</Text>
                <Text className="text-sm font-extrabold text-foreground">{value}</Text>
              </Pressable>
            );
          })}
        </View>

        {info ? (
          <View className="mt-3 items-center rounded-xl bg-muted px-4 py-3">
            <Text className="text-sm font-bold text-foreground">{info.label}</Text>
            <Text className="text-xs text-muted-foreground">{info.hint}</Text>
          </View>
        ) : null}

        {save.error ? <FormMessage>{(save.error as Error).message}</FormMessage> : null}

        <DrawerFooter className="px-0">
          <Button
            disabled={selected == null}
            loading={save.isPending}
            onPress={() => {
              if (selected != null) save.mutate(selected);
            }}
          >
            Confirmar
          </Button>
          <Button variant="ghost" onPress={skip}>
            Pular
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
