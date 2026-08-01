import { Text, View } from 'react-native';
import type { DayTotals, UserGoals } from '@fatia/api-client';
import { cn } from '@/components/ui';
import { NUMEROS_TABULARES, percentualDaMeta } from './helpers';

/**
 * Réplica de `apps/web/src/components/nutrition/macro-bento-grid.tsx`.
 *
 * As cores de proteína e gordura são as mesmas do PWA (`#4b8eff` e `#ffb4ab`):
 * são o código de cor dos macros no produto inteiro, e trocá-las por tokens do
 * tema faria os três cards ficarem verdes e indistinguíveis.
 */

interface Props {
  totals: DayTotals;
  goals: UserGoals | null;
}

export function MacroBentoGrid({ totals, goals }: Props) {
  const metaProteina = goals ? Math.round((goals.proteinMinG + goals.proteinMaxG) / 2) : 0;
  const metaCarbo = goals ? Math.round((goals.carbsMinG + goals.carbsMaxG) / 2) : 0;
  const metaGordura = goals ? Math.round((goals.fatMinG + goals.fatMaxG) / 2) : 0;

  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <MacroCard
          label="Proteína"
          atual={totals.proteinG}
          meta={metaProteina}
          cor="bg-[#4b8eff]"
          className="flex-1"
        />
        <MacroCard
          label="Carboidratos"
          atual={totals.carbsG}
          meta={metaCarbo}
          cor="bg-primary"
          className="flex-1"
        />
      </View>
      <MacroCard label="Gordura" atual={totals.fatG} meta={metaGordura} cor="bg-[#ffb4ab]" />
    </View>
  );
}

function MacroCard({
  label,
  atual,
  meta,
  cor,
  className,
}: {
  label: string;
  atual: number;
  meta: number;
  cor: string;
  className?: string;
}) {
  const percentual = percentualDaMeta(atual, meta);
  return (
    <View
      accessibilityLabel={
        meta > 0
          ? `${label}: ${Math.round(atual)} gramas de ${meta}, ${percentual}%`
          : `${label}: ${Math.round(atual)} gramas`
      }
      className={cn('rounded-xl border border-border bg-card p-4', className)}
    >
      <View className="flex-row items-baseline justify-between">
        <Text className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </Text>
        <Text style={NUMEROS_TABULARES} className="text-[15px] font-bold text-foreground">
          {Math.round(atual)}g
        </Text>
      </View>
      <View className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <View className={cn('h-full rounded-full', cor)} style={{ width: `${percentual}%` }} />
      </View>
      {meta > 0 ? (
        <Text className="mt-1.5 text-[10px] text-muted-foreground">
          {percentual}% · meta {meta}g
        </Text>
      ) : null}
    </View>
  );
}
