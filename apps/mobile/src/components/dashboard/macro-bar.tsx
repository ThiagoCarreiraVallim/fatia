import { Text, View } from 'react-native';
import { NUMEROS_TABULARES, percentualDaMeta } from './helpers';

/**
 * Barra de um macro no resumo de nutrição do dashboard.
 *
 * É a barra simples "consumido / alvo", diferente da `MacroBar` da fatia de
 * nutrição, que desenha faixa (mín–máx) e marca do mínimo. O dashboard mostra um
 * alvo único — o ponto médio da faixa —, então reaproveitar aquela exigiria
 * inventar um intervalo que a tela não tem.
 */
export function MacroBar({
  label,
  atual,
  alvo,
  cor,
  unidade = 'g',
}: {
  label: string;
  atual: number;
  alvo: number;
  cor: string;
  unidade?: string;
}) {
  const percentual = percentualDaMeta(atual, alvo) ?? 0;
  const rotulo = `${label}: ${Math.round(atual)} de ${alvo}${unidade}`;

  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text className="text-[12px] font-bold tracking-wide text-foreground">{label}</Text>
        <Text style={NUMEROS_TABULARES} className="text-[12px] font-bold text-muted-foreground">
          {Math.round(atual)}/{alvo}
          {unidade}
        </Text>
      </View>
      <View
        className="h-2 overflow-hidden rounded-full bg-muted"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={rotulo}
        accessibilityValue={{ min: 0, max: 100, now: percentual }}
      >
        <View
          className="h-full rounded-full"
          style={{ width: `${percentual}%`, backgroundColor: cor }}
        />
      </View>
    </View>
  );
}
