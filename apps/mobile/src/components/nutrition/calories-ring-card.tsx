import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Defs, G, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { DayTotals, UserGoals } from '@fatia/api-client';
import { NUMEROS_TABULARES } from './helpers';

/**
 * Réplica de `apps/web/src/components/nutrition/calories-ring-card.tsx`.
 *
 * O anel é `react-native-svg` direto (ADR 012): mesmo raio, mesma espessura e o
 * mesmo truque de `strokeDasharray`/`strokeDashoffset` do PWA. O brilho
 * diagonal do card, que no web é um `linear-gradient` em CSS, vira um `<Rect>`
 * com gradiente — não existe gradiente em `background` no React Native.
 */

const RAIO = 82;
const CENTRO = 110;
const TAMANHO = 220;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

interface Props {
  totals: DayTotals;
  goals: UserGoals | null;
}

export function CaloriesRingCard({ totals, goals }: Props) {
  const router = useRouter();

  const metaKcal = goals ? Math.round((goals.kcalMin + goals.kcalMax) / 2) : 0;
  const restante = goals ? Math.max(0, metaKcal - Math.round(totals.kcal)) : null;
  const proporcao = metaKcal > 0 ? Math.min(1, totals.kcal / metaKcal) : 0;
  const consumidas = Math.round(totals.kcal);

  return (
    <View className="overflow-hidden rounded-xl border border-border bg-card p-5">
      <View className="absolute inset-0" pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="brilhoAnel" x1="0" y1="0" x2="0.8" y2="1">
              <Stop offset="0" stopColor="#2ce500" stopOpacity="0.12" />
              <Stop offset="0.55" stopColor="#2ce500" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#brilhoAnel)" />
        </Svg>
      </View>

      <View className="items-center gap-4">
        <View
          style={{ width: TAMANHO, height: TAMANHO }}
          accessibilityRole="progressbar"
          accessibilityLabel={
            metaKcal > 0
              ? `${consumidas} de ${metaKcal} kcal consumidas`
              : `${consumidas} kcal consumidas`
          }
        >
          <Svg width={TAMANHO} height={TAMANHO} viewBox={`0 0 ${TAMANHO} ${TAMANHO}`}>
            {/* O anel começa às 12 horas, como no PWA. */}
            <G rotation={-90} origin={`${CENTRO}, ${CENTRO}`}>
              <Circle
                cx={CENTRO}
                cy={CENTRO}
                r={RAIO}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={14}
              />
              {proporcao > 0 ? (
                <Circle
                  cx={CENTRO}
                  cy={CENTRO}
                  r={RAIO}
                  fill="none"
                  stroke="#2ce500"
                  strokeWidth={14}
                  strokeLinecap="round"
                  strokeDasharray={CIRCUNFERENCIA}
                  strokeDashoffset={CIRCUNFERENCIA * (1 - proporcao)}
                />
              ) : null}
            </G>
          </Svg>

          <View className="absolute inset-0 items-center justify-center">
            <Text
              style={NUMEROS_TABULARES}
              className="text-[44px] font-bold leading-none text-foreground"
            >
              {consumidas}
            </Text>
            <Text className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              kcal consumidas
            </Text>
          </View>
        </View>

        {goals ? (
          <View className="w-full flex-row items-center justify-around border-t border-border pt-4">
            <Resumo rotulo="Meta" valor={metaKcal} />
            <View className="h-10 w-px bg-border" />
            <Resumo rotulo="Restante" valor={restante ?? 0} />
          </View>
        ) : (
          <View className="flex-row flex-wrap items-center justify-center">
            <Text className="text-center text-xs text-muted-foreground">Defina suas </Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Definir metas"
              onPress={() => router.push('/nutrition/goals')}
              hitSlop={12}
            >
              <Text className="text-xs text-primary underline">metas</Text>
            </Pressable>
            <Text className="text-center text-xs text-muted-foreground">
              {' '}
              para ver a meta calórica.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <View className="items-center gap-0.5">
      <Text className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </Text>
      <Text style={NUMEROS_TABULARES} className="text-[20px] font-bold text-foreground">
        {valor}
      </Text>
      <Text className="text-[11px] text-muted-foreground">kcal</Text>
    </View>
  );
}
