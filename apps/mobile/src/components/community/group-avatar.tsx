import { Image, View } from 'react-native';
import { cn } from '@/components/ui';
import { Text } from '@/components/ui/text';

/**
 * Avatar da comunidade (ADR 028), ou as iniciais quando ela não tem imagem.
 * `brand`: iniciais sobre a cor da comunidade, cheia (a patrocinada, como na
 * web); sem ele, o verde a 10%.
 */
export function GroupAvatar({
  name,
  url,
  size = 40,
  brand = false,
}: {
  name: string;
  url: string | null | undefined;
  size?: number;
  brand?: boolean;
}) {
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size }}
        className="rounded-xl"
      />
    );
  }
  const iniciais = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
      className={cn('items-center justify-center rounded-xl', brand ? 'bg-brand' : 'bg-primary/10')}
    >
      <Text className={cn('text-sm font-bold', brand ? 'text-brand-foreground' : 'text-primary')}>
        {iniciais}
      </Text>
    </View>
  );
}
