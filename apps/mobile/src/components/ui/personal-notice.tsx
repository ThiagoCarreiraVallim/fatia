import { View } from 'react-native';
import { personalNoticeView, type PersonalNoticeInput } from '@fatia/api-client';
import { colors } from '@/theme/colors';
import { Button } from './button';
import { Icon } from './icon';
import { Text } from './text';
import { cn } from './utils';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/**
 * Aviso "recebido do seu personal" (prancha Componentes-plano · 1.6), espelho
 * do `personal-notice.tsx` da web: treino, plano alimentar, avaliação pedida e
 * check-in. Os textos vêm do api-client.
 */
export function PersonalNotice({
  notice,
  onAction,
  className,
}: {
  notice: PersonalNoticeInput;
  onAction: () => void;
  className?: string;
}) {
  const v = personalNoticeView(notice);
  const attention = v.tone === 'attention';
  return (
    <View
      accessibilityLiveRegion="polite"
      className={cn(
        'flex-row items-center gap-3 rounded-field p-3',
        attention ? 'bg-warning/10' : 'bg-card',
        className,
      )}
    >
      {'avatar' in v.lead ? (
        <View className="h-7 w-7 items-center justify-center rounded-full bg-water/20">
          <Text className="font-sans-bold text-[11px] text-foreground">
            {initials(v.lead.avatar)}
          </Text>
        </View>
      ) : (
        <View
          className={cn(
            'h-7 w-7 items-center justify-center rounded-chip',
            attention ? 'bg-warning/20' : 'bg-muted',
          )}
        >
          <Icon
            name={v.lead.icon}
            size={16}
            color={attention ? colors.warning : colors.foreground}
          />
        </View>
      )}
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-sans-bold text-sm text-foreground">
          {v.title}
        </Text>
        <Text className="text-b2 text-muted-foreground">{v.detail}</Text>
      </View>
      <Button
        size="sm"
        variant={v.action === 'Ver' ? 'default' : 'secondary'}
        accessibilityLabel={`${v.action}: ${v.title}`}
        onPress={onAction}
      >
        {v.action}
      </Button>
    </View>
  );
}
