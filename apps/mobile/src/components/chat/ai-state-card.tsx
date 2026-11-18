import { Pressable, View } from 'react-native';
import { AlertCircle, Clock, RotateCw } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui';
import { colors } from '@/theme/colors';

const TONE = {
  warning: {
    border: 'border-warning/45',
    chip: 'bg-warning/15',
    color: colors.warning,
    icon: Clock,
  },
  danger: {
    border: 'border-danger/50',
    chip: 'bg-danger/15',
    color: colors.danger,
    icon: AlertCircle,
  },
} as const;

/**
 * O cartão dos estados da IA (prancha Al-M11), o mesmo do PWA: o ícone num chip da cor do
 * estado, o título, o texto e a ação de largura cheia. "Cota" é âmbar (volta tal hora, registro
 * à mão); "fora do ar" é vermelho (a mensagem ficou salva, tentar de novo).
 */
export function AiStateCard({
  tone,
  title,
  body,
  actionLabel,
  onAction,
  retry = false,
}: {
  tone: keyof typeof TONE;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  /** Mostra o ícone de tentar de novo na ação. */
  retry?: boolean;
}) {
  const { border, chip, color, icon: Icone } = TONE[tone];
  return (
    <View
      accessibilityRole="alert"
      className={cn('w-full gap-2.5 rounded-3xl border bg-card p-4', border)}
    >
      <View className="flex-row items-center gap-3">
        <View className={cn('h-9 w-9 items-center justify-center rounded-xl', chip)}>
          <Icone size={16} color={color} />
        </View>
        <Text className="flex-1 text-[15px] font-bold text-foreground">{title}</Text>
      </View>
      <Text className="text-sm text-muted-foreground">{body}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onAction}
        className="min-h-[44px] w-full flex-row items-center justify-center gap-2 rounded-full bg-secondary px-4"
      >
        {retry ? <RotateCw size={16} color={colors.foreground} /> : null}
        <Text className="text-sm font-semibold text-foreground">{actionLabel}</Text>
      </Pressable>
    </View>
  );
}
