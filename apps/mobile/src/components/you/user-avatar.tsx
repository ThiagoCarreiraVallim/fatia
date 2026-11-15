import { Image, View } from 'react-native';
import { initialsOf } from '@fatia/api-client';
import { Text } from '@/components/ui/text';

/** A foto da pessoa ou as iniciais (prancha Al-V1/V9). */
export function UserAvatar({
  name,
  url,
  size = 72,
}: {
  name: string | null | undefined;
  url?: string | null;
  size?: number;
}) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={style}
        accessibilityIgnoresInvertColors
        accessible={false}
        className="bg-muted"
      />
    );
  }
  return (
    <View style={style} className="items-center justify-center bg-brand" accessible={false}>
      <Text
        style={{ fontSize: Math.round(size * 0.34) }}
        className="font-display text-brand-foreground"
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}
