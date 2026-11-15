import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { IconName } from '@fatia/design';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';
import { cn } from '@/components/ui/utils';

/**
 * As listas de Você (prancha Al-V1) — réplica de
 * `apps/web/src/components/you/you-list.tsx`: título em caixa alta e um cartão
 * com linhas de 52 pt, ícone apagado, rótulo, detalhe e a seta.
 */
export function YouSection({ title, children }: { title: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View className="gap-2">
      <Text
        accessibilityRole="header"
        className="font-sans-bold text-[11px] uppercase tracking-widest text-muted-foreground"
      >
        {title}
      </Text>
      <View className="overflow-hidden rounded-card bg-card">
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? <View className="ml-12 h-px bg-border" /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

export function YouRow({
  icon,
  label,
  subtitle,
  detail,
  kind = 'link',
  on,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  icon: IconName;
  label: string;
  subtitle?: string;
  /** À direita, antes da seta: texto ou selo. */
  detail?: ReactNode;
  kind?: 'link' | 'action' | 'toggle';
  /** Só em `toggle`. */
  on?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole={kind === 'toggle' ? 'switch' : kind === 'link' ? 'link' : 'button'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={subtitle}
      accessibilityState={kind === 'toggle' ? { checked: !!on, disabled } : { disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-[52px] flex-row items-center gap-3 px-4 py-3 active:bg-surface-3',
        disabled && 'opacity-60',
      )}
    >
      <Icon name={icon} size={20} color={colors.mutedForeground} />
      <View className="flex-1">
        <Text className="font-sans-semibold text-[15px] text-foreground">{label}</Text>
        {subtitle ? <Text className="text-[13px] text-muted-foreground">{subtitle}</Text> : null}
      </View>
      {typeof detail === 'string' ? (
        <Text className="text-[13px] text-muted-foreground">{detail}</Text>
      ) : (
        detail
      )}
      {kind === 'toggle' ? <ToggleTrack on={!!on} /> : null}
      {kind === 'link' ? <Icon name="chevR" size={18} color={colors.faintForeground} /> : null}
    </Pressable>
  );
}

/** O trilho do interruptor, só desenho: a linha inteira é o toque. */
export function ToggleTrack({ on }: { on: boolean }) {
  return (
    <View
      className={cn(
        'h-7 w-12 justify-center rounded-pill px-[3px]',
        on ? 'bg-primary' : 'bg-surface-3',
      )}
    >
      <View
        className={cn(
          'h-[22px] w-[22px] rounded-pill',
          on ? 'self-end bg-primary-foreground' : 'self-start bg-white',
        )}
      />
    </View>
  );
}
