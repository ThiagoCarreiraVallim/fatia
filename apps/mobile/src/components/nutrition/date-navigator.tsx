import { Pressable, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { deslocarDia, formatarDiaCurto } from './helpers';

/**
 * Réplica de `apps/web/src/components/nutrition/date-navigator.tsx`.
 *
 * No PWA o dia escolhido vive na query string e cada seta é um `router.push`.
 * Aqui é estado da tela: empilhar uma entrada de navegação por dia visitado
 * faria o botão voltar do Android percorrer o calendário de trás para frente em
 * vez de sair da tela.
 */
export function DateNavigator({
  date,
  onChange,
}: {
  date: string;
  onChange: (date: string) => void;
}) {
  return (
    <View className="flex-row items-center justify-between rounded-md border border-border bg-card p-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dia anterior"
        onPress={() => onChange(deslocarDia(date, -1))}
        className="h-11 w-11 items-center justify-center rounded-md active:bg-accent"
      >
        <ChevronLeft size={20} color="#e5e2e1" />
      </Pressable>
      <Text className="text-sm font-medium capitalize text-foreground">
        {formatarDiaCurto(date)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Próximo dia"
        onPress={() => onChange(deslocarDia(date, 1))}
        className="h-11 w-11 items-center justify-center rounded-md active:bg-accent"
      >
        <ChevronRight size={20} color="#e5e2e1" />
      </Pressable>
    </View>
  );
}
