import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { brandColors } from '@/components/ui/ds-math';

/**
 * Marca da comunidade (prancha Componentes-plano · 1.1), espelho do
 * `brand-cover.tsx` da web: a cor numa faixa no alto do card e o nome e a
 * contagem no texto do card — texto nenhum vai sobre a cor. A cor passa pela
 * mesma regra da web e da API (`brandColors`).
 */
export function BrandCover({
  name,
  color,
  subtitle,
  logo,
}: {
  name: string;
  color: string | null | undefined;
  subtitle?: string;
  logo?: ReactNode;
}) {
  const brand = brandColors(color);
  return (
    <View className="overflow-hidden rounded-card bg-card">
      <View style={{ height: 110, backgroundColor: brand.background }} />
      <View className="flex-row items-center gap-3 p-4">
        {logo}
        <View className="min-w-0 flex-1">
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="font-display text-h3 text-foreground"
          >
            {name}
          </Text>
          {subtitle ? <Text className="text-b2 text-muted-foreground">{subtitle}</Text> : null}
        </View>
      </View>
    </View>
  );
}
