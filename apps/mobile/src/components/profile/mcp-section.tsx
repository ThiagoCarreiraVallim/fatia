import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { env } from '@/env';
import { CopyMcpUrl } from './copy-mcp-url';

/**
 * Equivalente do `<details>` "Conectar ao Claude" do PWA. `<details>` não existe
 * no React Native; o recolher/expandir é estado.
 */
export function McpSection() {
  const [open, setOpen] = useState(false);

  return (
    <View className="rounded-2xl border border-border bg-card px-4 py-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Conectar ao Claude"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        className="min-h-[44px] flex-row items-center justify-between"
      >
        <Text className="text-sm font-bold text-foreground">Conectar ao Claude</Text>
        {open ? (
          <ChevronDown size={16} color="#baccaf" />
        ) : (
          <ChevronRight size={16} color="#baccaf" />
        )}
      </Pressable>

      {open ? (
        <View className="mt-3 gap-3">
          <Text className="text-xs text-muted-foreground">
            Configure o conector MCP no Claude com a URL abaixo.
          </Text>
          <CopyMcpUrl url={env.mcpUrl} />
        </View>
      ) : null}
    </View>
  );
}
