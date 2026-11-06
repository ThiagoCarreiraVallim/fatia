import { ScrollView, Text, View } from 'react-native';
import type { ChatArtifact } from '@fatia/api-client';
import { LineChart, formatDecimal } from '@/components/charts';
import { cn } from '@/components/ui';

/**
 * O cartão de uma tool (evento `artifact`), nos quatro formatos que o agente
 * emite (`artefatos.py`). Gráfico com o kit do app (ADR 012).
 */

const numero = (v: number) => formatDecimal(v, Number.isInteger(v) ? 0 : 1);

export function ArtifactCard({ artifact }: { artifact: ChatArtifact }) {
  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-3">
      {artifact.label ? (
        <Text className="text-xs font-semibold uppercase text-muted-foreground">
          {artifact.label}
        </Text>
      ) : null}
      <Conteudo artifact={artifact} />
    </View>
  );
}

function Conteudo({ artifact }: { artifact: ChatArtifact }) {
  switch (artifact.kind) {
    case 'metric': {
      const alvo = artifact.target;
      return (
        <View className="gap-2">
          <Text className="text-2xl font-bold text-foreground">
            {numero(artifact.value)}
            {artifact.unit ? <Text className="text-base font-normal"> {artifact.unit}</Text> : null}
          </Text>
          {alvo && (alvo.min != null || alvo.max != null) ? (
            <Text className="text-xs text-muted-foreground">
              Meta:{' '}
              {alvo.min != null && alvo.max != null
                ? `${numero(alvo.min)} a ${numero(alvo.max)}`
                : alvo.min != null
                  ? `a partir de ${numero(alvo.min)}`
                  : `até ${numero(alvo.max as number)}`}
              {artifact.unit ? ` ${artifact.unit}` : ''}
            </Text>
          ) : null}
          {artifact.breakdown?.map((item) => (
            <View key={item.label} className="flex-row justify-between">
              <Text className="text-sm text-muted-foreground">{item.label}</Text>
              <Text className="text-sm text-foreground">
                {numero(item.value)} {item.unit ?? artifact.unit ?? ''}
              </Text>
            </View>
          ))}
        </View>
      );
    }
    case 'timeline':
      return artifact.events.length > 1 ? (
        <View className="gap-1">
          <LineChart
            name={artifact.label ?? 'Evolução'}
            labels={artifact.events.map((e) => e.date)}
            values={artifact.events.map((e) => e.value)}
            height={150}
            area
          />
          {artifact.delta != null ? (
            <Text className="text-xs text-muted-foreground">
              Variação: {artifact.delta > 0 ? '+' : ''}
              {numero(artifact.delta)} {artifact.unit ?? ''}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text className="text-sm text-muted-foreground">Poucos pontos para um gráfico.</Text>
      );
    case 'report':
      return (
        <ScrollView horizontal>
          <View>
            {[artifact.columns, ...artifact.rows].map((linha, r) => (
              <View key={r} className={cn('flex-row', r > 0 && 'border-t border-border')}>
                {linha.map((celula, c) => (
                  <Text
                    key={c}
                    className={cn(
                      'w-28 px-1.5 py-1 text-[13px] text-foreground',
                      r === 0 && 'font-semibold',
                    )}
                  >
                    {celula == null ? '—' : typeof celula === 'number' ? numero(celula) : celula}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    case 'comparison':
      return (
        <View className="gap-1.5">
          {artifact.items.map((item) => (
            <View key={item.label} className="flex-row justify-between gap-3">
              <Text className="flex-1 text-sm text-muted-foreground">{item.label}</Text>
              <Text className="text-sm font-semibold text-foreground">
                {typeof item.value === 'number' ? numero(item.value) : item.value} {item.unit ?? ''}
              </Text>
            </View>
          ))}
        </View>
      );
  }
}
