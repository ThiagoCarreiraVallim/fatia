import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nutritionApi, type MealItem } from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui';
import { DrawerInput } from './drawer-input';
import { mensagemDeErro, parsePositivo } from './helpers';

/**
 * Réplica de `apps/web/src/components/nutrition/edit-meal-item-drawer.tsx`.
 *
 * Formulário curto, então o sheet dimensiona pelo conteúdo (`DrawerContent`,
 * sem `snapPoints`) — o teclado ocupa metade da tela e um sheet de altura fixa
 * empurraria o único campo para fora.
 */
export function EditMealItemDrawer({
  item,
  date,
  onClose,
}: {
  item: MealItem | null;
  date: string;
  onClose: () => void;
}) {
  const aberto = item !== null;
  const [gramas, setGramas] = useState('');
  const qc = useQueryClient();

  useEffect(() => {
    if (item) setGramas(String(item.grams));
  }, [item]);

  const salvar = useMutation({
    mutationFn: () => {
      if (!item) throw new Error('Sem item');
      const g = parsePositivo(gramas);
      if (g === null) throw new Error('Gramas inválidas');
      return nutritionApi.updateItem(item.id, { grams: g });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary', date] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'history', 7] });
      onClose();
    },
  });

  const erro = salvar.error
    ? mensagemDeErro(salvar.error, {
        conflito: 'Esse item já foi registrado nessa refeição.',
        alternativa: 'Não foi possível salvar. Tente de novo.',
      })
    : undefined;

  return (
    <Drawer open={aberto} onOpenChange={(estaAberto) => !estaAberto && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Editar item</DrawerTitle>
          <DrawerDescription>{item?.foodName}</DrawerDescription>
        </DrawerHeader>

        <View className="gap-4 px-4 py-3">
          <DrawerInput
            label="Quantidade (g)"
            autoFocus
            keyboardType="numeric"
            inputMode="decimal"
            value={gramas}
            onChangeText={setGramas}
          />
          {erro ? (
            <Text accessibilityRole="alert" className="text-sm text-destructive">
              {erro}
            </Text>
          ) : null}
        </View>

        <DrawerFooter className="flex-row">
          <Button variant="outline" className="flex-1" onPress={onClose}>
            Cancelar
          </Button>
          <Button
            className="flex-1"
            onPress={() => salvar.mutate()}
            disabled={salvar.isPending}
            loading={salvar.isPending}
          >
            Salvar
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
