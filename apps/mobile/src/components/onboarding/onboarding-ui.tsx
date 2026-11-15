import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { PROGRESS_SEGMENTS } from '@fatia/api-client';
import type { IconName } from '@fatia/design';
import { Icon, Text, cn } from '@/components/ui';
import { colors } from '@/theme/colors';

/**
 * Peças das telas Onb-* no app, as mesmas do PWA
 * (`apps/web/src/components/onboarding/onboarding-ui.tsx`): o topo com voltar,
 * a barra de 9 traços e "Pular"; o cartão de escolha; o check; a chave; e os
 * botões principal e fantasma.
 */

export function StepHeader({
  segment,
  onBack,
  onSkip,
}: {
  segment: number;
  onBack?: (() => void) | null;
  onSkip?: (() => void) | null;
}) {
  return (
    <View className="flex-row items-center gap-3">
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={onBack}
          className="h-11 w-11 items-center justify-center rounded-[14px] bg-card active:scale-95"
        >
          <Icon name="chevL" size={22} />
        </Pressable>
      ) : (
        <View className="h-11 w-11" />
      )}
      <ProgressBar segment={segment} />
      {onSkip ? (
        <Pressable
          accessibilityRole="button"
          onPress={onSkip}
          className="h-[34px] justify-center rounded-[10px] px-3.5"
        >
          <Text className="text-[13px] font-bold text-foreground">Pular</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ProgressBar({ segment, onBrand = false }: { segment: number; onBrand?: boolean }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Progresso do cadastro"
      accessibilityValue={{ min: 1, max: PROGRESS_SEGMENTS, now: segment + 1 }}
      className="flex-1 flex-row gap-1.5"
    >
      {Array.from({ length: PROGRESS_SEGMENTS }, (_, i) => (
        <View
          key={i}
          className={cn(
            'h-1 flex-1 rounded-[2px]',
            onBrand
              ? i === segment
                ? 'bg-brand-foreground'
                : 'bg-brand-foreground/30'
              : i < segment
                ? 'bg-primary'
                : i === segment
                  ? 'bg-foreground'
                  : 'bg-surface-3',
          )}
        />
      ))}
    </View>
  );
}

export function PrimaryButton({
  children,
  onPress,
  disabled,
  pending,
  brand = false,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  pending?: boolean;
  brand?: boolean;
}) {
  const off = disabled || pending;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!pending }}
      disabled={off}
      onPress={onPress}
      className={cn(
        'h-[52px] flex-row items-center justify-center gap-2 rounded-[16px] px-6 active:scale-[0.98]',
        brand ? 'bg-brand' : 'bg-primary',
        off && 'opacity-40',
      )}
    >
      {pending ? (
        <ActivityIndicator color={brand ? colors.brandForeground : colors.primaryForeground} />
      ) : null}
      {typeof children === 'string' ? (
        <Text
          className={cn(
            'text-[15px] font-bold',
            brand ? 'text-brand-foreground' : 'text-primary-foreground',
          )}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function GhostButton({
  children,
  onPress,
  disabled,
}: {
  children: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'h-[52px] items-center justify-center rounded-[16px]',
        disabled && 'opacity-40',
      )}
    >
      <Text className="text-[15px] font-bold text-foreground">{children}</Text>
    </Pressable>
  );
}

const CHIP_TONES = {
  lime: { box: 'bg-primary/15', color: () => colors.primary },
  brand: { box: 'bg-brand/15', color: () => colors.brand },
  water: { box: 'bg-water/15', color: () => colors.water },
  amber: { box: 'bg-steps/15', color: () => colors.steps },
  pink: { box: 'bg-fat/15', color: () => colors.fat },
  neutral: { box: 'bg-surface-3', color: () => colors.foreground },
} as const;

export function OnbChipIcon({
  icon,
  tone = 'lime',
  size = 40,
}: {
  icon: IconName;
  tone?: keyof typeof CHIP_TONES;
  size?: 40 | 52 | 64 | 72;
}) {
  const box = {
    40: 'h-10 w-10 rounded-[14px]',
    52: 'h-[52px] w-[52px] rounded-[18px]',
    64: 'h-16 w-16 rounded-[22px]',
    72: 'h-[72px] w-[72px] rounded-[24px]',
  } as const;
  const iconSize = { 40: 20, 52: 24, 64: 32, 72: 32 } as const;
  return (
    <View className={cn('items-center justify-center', box[size], CHIP_TONES[tone].box)}>
      <Icon name={icon} size={iconSize[size]} color={CHIP_TONES[tone].color()} />
    </View>
  );
}

export function Check({ on, round = false }: { on: boolean; round?: boolean }) {
  return (
    <View
      className={cn(
        'h-6 w-6 items-center justify-center',
        round ? 'rounded-full' : 'rounded-[8px]',
        on ? 'bg-primary' : 'border-2 border-border-strong',
      )}
    >
      {on ? <Icon name="check" size={16} color={colors.primaryForeground} /> : null}
    </View>
  );
}

export function Toggle({ on, dim = false }: { on: boolean; dim?: boolean }) {
  return (
    <View
      className={cn(
        'h-7 w-12 justify-center rounded-pill px-[3px]',
        on ? 'items-end bg-primary' : 'items-start bg-surface-3',
        dim && 'opacity-55',
      )}
    >
      <View
        className={cn('h-[22px] w-[22px] rounded-pill', on ? 'bg-primary-foreground' : 'bg-white')}
      />
    </View>
  );
}

export function choiceCardClass(selected: boolean, tight = false) {
  return cn(
    'w-full flex-row items-center gap-3.5 rounded-card bg-card',
    tight ? 'px-[18px] py-4' : 'p-5',
    selected && 'border-2 border-primary bg-primary/10',
  );
}

export function StepperButton({
  kind,
  label,
  onPress,
  disabled,
}: {
  kind: 'minus' | 'plus';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'h-10 w-10 items-center justify-center rounded-[14px] bg-muted',
        disabled && 'opacity-40',
      )}
    >
      {kind === 'plus' ? (
        <Icon name="plus" size={16} />
      ) : (
        <View className="h-0.5 w-3 rounded-[1px] bg-foreground" />
      )}
    </Pressable>
  );
}

export function Avatar({
  initials,
  tone = 'neutral',
  first = false,
}: {
  initials: string;
  tone?: 'neutral' | 'blue' | 'amber';
  first?: boolean;
}) {
  const tones = {
    neutral: ['bg-surface-3', 'text-foreground'],
    blue: ['bg-[#2f4a7a]', 'text-[#dbe6ff]'],
    amber: ['bg-[#5a4718]', 'text-[#ffe9b0]'],
  } as const;
  return (
    <View
      className={cn(
        'h-7 w-7 items-center justify-center rounded-full border-[3px] border-background',
        !first && '-ml-2.5',
        tones[tone][0],
      )}
    >
      <Text className={cn('font-display text-[10px]', tones[tone][1])}>{initials}</Text>
    </View>
  );
}

export const AVATAR_TONES = ['neutral', 'blue', 'amber'] as const;
