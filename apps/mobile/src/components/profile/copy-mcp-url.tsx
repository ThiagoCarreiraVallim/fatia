import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy } from 'lucide-react-native';
import { Button } from '@/components/ui';

/**
 * Réplica de `apps/web/src/components/profile/copy-mcp-url.tsx`.
 *
 * `navigator.clipboard` não existe no React Native — o equivalente é o
 * `expo-clipboard`, que fala com o pasteboard do sistema.
 */
export function CopyMcpUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sem isto, sair da tela nos 2 s seguintes ao toque deixa um timer vivo
  // chamando `setState` num componente que já saiu da árvore.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function handleCopy() {
    await Clipboard.setStringAsync(url);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <View className="flex-row items-center gap-2 rounded-md border border-border bg-muted p-2">
      <Text numberOfLines={1} className="flex-1 text-xs text-foreground">
        {url}
      </Text>
      <Button
        variant="ghost"
        size="icon"
        onPress={() => void handleCopy()}
        accessibilityLabel={copied ? 'URL copiada' : 'Copiar URL'}
      >
        {copied ? <Check size={16} color="#2ce500" /> : <Copy size={16} color="#baccaf" />}
      </Button>
    </View>
  );
}
