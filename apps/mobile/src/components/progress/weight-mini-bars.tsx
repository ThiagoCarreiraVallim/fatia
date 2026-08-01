import { Text, View } from 'react-native';
import { formatDecimal } from '@/components/charts';

const HEIGHT = 64;
/** Piso de 40% da altura: variação de peso é pequena e barra proporcional pura sumiria. */
const FLOOR = 0.4;

/**
 * Mini-histórico de peso do topo da tela — o `WeightBarMini` que vive dentro de
 * `apps/web/src/app/(app)/progress/page.tsx`.
 *
 * Aqui a altura é calculada em pixels, e não em porcentagem: no React Native uma
 * altura percentual depende de o pai ter altura resolvida, e um valor de 6px de
 * mínimo dentro de porcentagem se comporta de forma diferente em cada
 * plataforma.
 */
export function WeightMiniBars({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <Text className="py-2 text-xs text-muted-foreground">
        Logue pelo menos dois pesos para ver a evolução.
      </Text>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return (
    <View
      className="flex-row items-end gap-1 pt-4"
      accessible
      accessibilityLabel={`Últimas ${values.length} pesagens: ${values
        .map((value) => `${formatDecimal(value, 1)} kg`)
        .join(', ')}.`}
    >
      {values.map((value, index) => {
        const isLast = index === values.length - 1;
        const height = Math.max(6, (FLOOR + ((value - min) / range) * (1 - FLOOR)) * HEIGHT);
        return (
          <View key={`${index}-${value}`} className="flex-1 items-center">
            {isLast ? (
              <Text className="text-[9px] font-extrabold tracking-wide text-primary">HOJE</Text>
            ) : null}
            <View
              className={`w-full rounded-sm ${isLast ? 'bg-primary' : 'bg-muted'}`}
              style={{ height }}
            />
          </View>
        );
      })}
    </View>
  );
}
