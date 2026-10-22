import { Linking, Text, View } from 'react-native';
import { parseMarkdownLite, type InlineToken } from '@fatia/api-client';

function inline(tokens: InlineToken[], key = ''): React.ReactNode[] {
  return tokens.map((t, i) => {
    const k = `${key}${i}`;
    if (t.type === 'text') return t.text;
    if (t.type === 'bold') {
      return (
        <Text key={k} className="font-bold">
          {inline(t.children, `${k}-`)}
        </Text>
      );
    }
    if (t.type === 'italic') {
      return (
        <Text key={k} className="italic">
          {inline(t.children, `${k}-`)}
        </Text>
      );
    }
    return (
      <Text
        key={k}
        accessibilityRole="link"
        onPress={() => void Linking.openURL(t.href)}
        className="font-semibold text-primary underline"
      >
        {inline(t.children, `${k}-`)}
      </Text>
    );
  });
}

/** O markdown restrito das dicas no app, igual ao da web: tokens, nunca HTML. */
export function MarkdownLite({ source }: { source: string }) {
  return (
    <View className="gap-2">
      {parseMarkdownLite(source).map((b, i) =>
        b.type === 'paragraph' ? (
          <Text key={i} className="text-sm leading-5 text-foreground">
            {inline(b.children)}
          </Text>
        ) : (
          <View key={i} className="gap-1">
            {b.items.map((item, j) => (
              <View key={j} className="flex-row gap-2">
                <Text className="text-sm text-foreground">{b.ordered ? `${j + 1}.` : '•'}</Text>
                <Text className="flex-1 text-sm leading-5 text-foreground">{inline(item)}</Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
}
