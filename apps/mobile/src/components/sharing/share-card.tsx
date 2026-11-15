import { View } from 'react-native';
import { shareIdentityText, type ShareIdentityChoice } from '@fatia/api-client';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui/utils';
import { colors } from '@/theme/colors';

/**
 * Cartão compartilhável (prancha Componentes-plano · 1.4), espelho do
 * `share-card.tsx` da web. A lista do que entra é fechada: peso, medidas,
 * fotos do corpo e % de gordura não têm prop. O cartão é uma imagem para fora
 * do app, então tem fundo fixo escuro nos dois temas.
 */
export interface ShareCardData {
  kind: 'streak' | 'workout' | 'challenge' | 'day';
  headline: string;
  caption: string;
  stats?: { label: string; value: string }[];
}

export type ShareIdentity = ShareIdentityChoice;

const CARD_BG = '#131313';
const CARD_TEXT = '#ffffff';

export function ShareCard({
  data,
  identity,
  className,
}: {
  data: ShareCardData;
  identity: ShareIdentity;
  className?: string;
}) {
  const who = shareIdentityText(identity);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${data.caption}: ${data.headline}${who ? `, ${who}` : ''}`}
      className={cn('aspect-[4/5] w-full justify-between rounded-card p-6', className)}
      style={{ backgroundColor: CARD_BG, maxWidth: 320 }}
    >
      <View className="flex-row items-center gap-2">
        <View className="h-2.5 w-2.5 rounded-full bg-primary" />
        <Text className="font-sans-bold text-sm" style={{ color: CARD_TEXT }}>
          fatia
        </Text>
      </View>
      <View>
        <Text className="font-display text-[44px] leading-[44px]" style={{ color: CARD_TEXT }}>
          {data.headline}
        </Text>
        <Text className="mt-2 text-sm" style={{ color: CARD_TEXT, opacity: 0.7 }}>
          {data.caption}
        </Text>
        {data.stats?.length ? (
          <View className="mt-5 flex-row gap-2">
            {data.stats.slice(0, 3).map((s) => (
              <View key={s.label} className="flex-1">
                <Text className="text-[11px]" style={{ color: CARD_TEXT, opacity: 0.6 }}>
                  {s.label}
                </Text>
                <Text className="font-display text-base" style={{ color: CARD_TEXT }}>
                  {s.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="text-xs" style={{ color: CARD_TEXT, opacity: 0.7 }}>
          {who ?? ''}
        </Text>
        <Icon name="share" size={16} color={colors.primary} />
      </View>
    </View>
  );
}
