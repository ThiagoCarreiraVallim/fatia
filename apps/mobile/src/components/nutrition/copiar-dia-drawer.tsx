import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  copyDayText,
  dayLabel,
  defaultCopyTarget,
  nutritionApi,
  type CopyDayResult,
} from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui';
import { CopiarParaDia } from './copiar-para-dia';
import { hojeIso, mensagemDeErro } from './helpers';

/** Réplica de `apps/web/src/components/nutrition/copy-day-drawer.tsx`. */
export function CopiarDiaDrawer({
  open,
  onOpenChange,
  date,
  mealCount,
  onVerDia,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  mealCount: number;
  onVerDia: (dia: string) => void;
}) {
  const qc = useQueryClient();
  const hoje = hojeIso();
  // A última cópia feita fica à vista mesmo se a próxima tentativa falhar.
  const [copiado, setCopiado] = useState<{ texto: string; dia: string } | null>(null);
  const copiar = useMutation<CopyDayResult, Error, string>({
    mutationFn: (toDate) => nutritionApi.copyDay({ fromDate: date, toDate }),
    onSuccess: (resultado, toDate) => {
      setCopiado({ texto: copyDayText(resultado), dia: toDate });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'summary', toDate] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary', toDate] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'history'] });
    },
  });

  const fechar = () => {
    copiar.reset();
    setCopiado(null);
    onOpenChange(false);
  };
  const refeicoes = mealCount === 1 ? 'A refeição' : `As ${mealCount} refeições`;

  return (
    <Drawer open={open} onOpenChange={(aberto) => (aberto ? onOpenChange(true) : fechar())}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Copiar dia</DrawerTitle>
          <DrawerDescription>
            {`${refeicoes} de ${dayLabel(date, hoje)} vão para o dia escolhido, cada uma no mesmo horário. O que já estiver lá não duplica.`}
          </DrawerDescription>
        </DrawerHeader>
        <View className="px-4 py-3">
          <CopiarParaDia
            key={date}
            diaPadrao={defaultCopyTarget(date, hoje)}
            hoje={hoje}
            pendente={copiar.isPending}
            erro={copiar.error ? mensagemDeErro(copiar.error) : null}
            feito={copiado}
            onCopiar={(dia) => copiar.mutate(dia)}
            onVer={(dia) => {
              onVerDia(dia);
              fechar();
            }}
          />
        </View>
        <DrawerFooter>
          <Button variant="ghost" onPress={fechar}>
            Fechar
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
