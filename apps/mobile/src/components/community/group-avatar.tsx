import { Image, Text, View } from 'react-native';

/** Avatar da comunidade (ADR 028), ou as iniciais quando ela não tem imagem. */
export function GroupAvatar({
  name,
  url,
  size = 40,
}: {
  name: string;
  url: string | null | undefined;
  size?: number;
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
      className="items-center justify-center rounded-xl bg-primary/10"
    >
      <Text className="text-sm font-bold text-primary">{iniciais}</Text>
    </View>
  );
}
