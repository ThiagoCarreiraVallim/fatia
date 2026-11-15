import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { HEIGHT_MAX_CM, HEIGHT_MIN_CM, stepHeight, usersApi } from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  FormMessage,
} from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';

const START_CM = 170;

/** A folha "Estatura" de Você (prancha Al-V1): menos, o número, mais e Salvar. */
export function HeightSheet({
  open,
  onOpenChange,
  heightCm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heightCm: number | null;
}) {
  const [value, setValue] = useState(Math.round(heightCm ?? START_CM));
  // Reabrir parte do valor salvo; ajuste no render, e não num efeito (#187).
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setValue(Math.round(heightCm ?? START_CM));
  }

  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => usersApi.updateMe({ heightCm: value }),
    onSuccess: (me) => {
      qc.setQueryData(['users', 'me'], me);
      onOpenChange(false);
    },
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-6 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Estatura</DrawerTitle>
        </DrawerHeader>
        <View className="my-4 flex-row items-center justify-center gap-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Menos"
            disabled={value <= HEIGHT_MIN_CM}
            onPress={() => setValue((v) => stepHeight(v, -1))}
            className="h-[52px] w-[52px] items-center justify-center rounded-full bg-muted active:opacity-80"
          >
            <View className="h-0.5 w-3 bg-foreground" />
          </Pressable>
          <Text
            accessibilityLiveRegion="polite"
            className="min-w-[96px] text-center font-display text-5xl text-foreground"
          >
            {value}
            <Text className="text-lg text-muted-foreground"> cm</Text>
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mais"
            disabled={value >= HEIGHT_MAX_CM}
            onPress={() => setValue((v) => stepHeight(v, 1))}
            className="h-[52px] w-[52px] items-center justify-center rounded-full bg-muted active:opacity-80"
          >
            <Icon name="plus" size={20} color={colors.foreground} />
          </Pressable>
        </View>
        <FormMessage>{save.error ? 'Não deu para salvar. Tente de novo.' : undefined}</FormMessage>
        <Button size="xl" className="w-full" loading={save.isPending} onPress={() => save.mutate()}>
          Salvar
        </Button>
      </DrawerContent>
    </Drawer>
  );
}
