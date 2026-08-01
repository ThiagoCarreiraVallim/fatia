import { Text, View } from 'react-native';
import { cn } from '@/components/ui';
import { NUMEROS_TABULARES } from './helpers';

/**
 * Réplica de `apps/web/src/components/nutrition/macro-bar.tsx`.
 *
 * Barra com faixa: dentro do intervalo, na borda (até 10% fora) ou fora.
 * O tema não tem cor de aviso, então os dois estados fora do verde usam os
 * mesmos tons do PWA (âmbar e vermelho do Tailwind) — o vermelho do tema
 * (`#93000a`) some sobre o fundo escuro quando é preenchimento de barra.
 */

const COR_POR_ESTADO = {
  dentro: 'bg-primary',
  borda: 'bg-[#facc15]',
  fora: 'bg-[#f43f5e]',
} as const;

export function MacroBar({
  label,
  value,
  min,
  max,
  unit = 'g',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
}) {
  const preenchimento = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const estado: keyof typeof COR_POR_ESTADO =
    value >= min && value <= max
      ? 'dentro'
      : value < min * 0.9 || value > max * 1.1
        ? 'fora'
        : 'borda';
  const marcaMinimo = max > 0 ? (min / max) * 100 : 0;

  return (
    <View className="gap-1">
      <View className="flex-row justify-between">
        <Text className="text-xs text-muted-foreground">{label}</Text>
        <Text style={NUMEROS_TABULARES} className="text-xs text-foreground">
          {Math.round(value)}
          {unit} / {min}–{max}
          {unit}
        </Text>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-secondary">
        <View
          className={cn('h-full rounded-full', COR_POR_ESTADO[estado])}
          style={{ width: `${preenchimento}%` }}
        />
        <View
          className="absolute top-0 h-full w-px bg-foreground/40"
          style={{ left: `${marcaMinimo}%` }}
        />
      </View>
    </View>
  );
}
