import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { dayLabel, shiftDay } from '@fatia/api-client';
import { Button } from '@/components/ui';

/**
 * Réplica de `apps/web/src/components/nutrition/copy-to-day.tsx`.
 *
 * O dia de destino anda nas setas, como o navegador de data da tela, em vez de
 * um seletor de calendário: o caso comum é ontem → hoje ou hoje → amanhã, a um
 * ou dois toques, e o app não carrega dependência de date picker por isso.
 */
export function CopiarParaDia({
  diaPadrao,
  hoje,
  pendente,
  erro,
  feito,
  onCopiar,
  onVer,
}: {
  diaPadrao: string;
  hoje: string;
  pendente: boolean;
  erro: string | null;
  /** O que foi feito, e para qual dia. */
  feito: { texto: string; dia: string } | null;
  onCopiar: (dia: string) => void;
  onVer: (dia: string) => void;
}) {
  const [dia, setDia] = useState(diaPadrao);
  const rotulo = dayLabel(dia, hoje);

  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-foreground">Dia de destino</Text>
      <View className="flex-row items-center justify-between rounded-md border border-border p-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dia de destino anterior"
          onPress={() => setDia(shiftDay(dia, -1))}
          className="h-11 w-11 items-center justify-center rounded-md active:bg-accent"
        >
          <ChevronLeft size={20} color="#e5e2e1" />
        </Pressable>
        <Text className="text-sm font-medium capitalize text-foreground">{rotulo}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Próximo dia de destino"
          onPress={() => setDia(shiftDay(dia, 1))}
          className="h-11 w-11 items-center justify-center rounded-md active:bg-accent"
        >
          <ChevronRight size={20} color="#e5e2e1" />
        </Pressable>
      </View>
      <Button onPress={() => onCopiar(dia)} disabled={pendente} loading={pendente}>
        {`Copiar para ${rotulo}`}
      </Button>
      {erro ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {erro}
        </Text>
      ) : null}
      {feito ? (
        <View className="flex-row items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2">
          <View accessibilityRole="text" className="flex-1 flex-row items-center gap-2">
            <Check size={16} color="#2ce500" />
            <Text className="text-sm text-primary">{feito.texto}</Text>
          </View>
          <Pressable
            accessibilityRole="link"
            onPress={() => onVer(feito.dia)}
            hitSlop={8}
            className="min-h-11 justify-center"
          >
            <Text className="text-sm font-medium text-primary underline">
              {`Ver ${dayLabel(feito.dia, hoje)}`}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
