import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTextInput,
  DrawerTitle,
  FormMessage,
  Label,
} from '@/components/ui';

/** Réplica de `apps/web/src/components/profile/edit-height-drawer.tsx`. */
export function EditHeightDrawer({
  open,
  onClose,
  currentHeightCm,
}: {
  open: boolean;
  onClose: () => void;
  currentHeightCm: number | null;
}) {
  const [value, setValue] = useState('');
  const qc = useQueryClient();

  useEffect(() => {
    if (open) setValue(currentHeightCm?.toString() ?? '');
  }, [open, currentHeightCm]);

  const mutation = useMutation({
    mutationFn: () => {
      const cm = Number(value);
      if (!Number.isFinite(cm) || cm <= 0) throw new Error('Estatura inválida.');
      return usersApi.updateMe({ heightCm: cm });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', 'me'] });
      onClose();
    },
  });

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Estatura</DrawerTitle>
          <DrawerDescription>Sua altura em centímetros.</DrawerDescription>
        </DrawerHeader>

        <View className="my-3 gap-4">
          <View className="gap-1.5">
            <Label>Altura (cm)</Label>
            <DrawerTextInput
              accessibilityLabel="Altura em centímetros"
              value={value}
              onChangeText={setValue}
              keyboardType="number-pad"
              placeholder="ex: 182"
              placeholderTextColor="#8a8a8a"
              selectionColor="#2ce500"
              autoFocus
              className="min-h-[44px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground"
            />
          </View>

          <FormMessage>{mutation.error?.message}</FormMessage>

          <Button className="w-full" loading={mutation.isPending} onPress={() => mutation.mutate()}>
            {mutation.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </View>
      </DrawerContent>
    </Drawer>
  );
}
