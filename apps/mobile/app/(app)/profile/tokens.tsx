import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { env } from '@/env';
import { Screen } from '@/components/layout/screen';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { CopyMcpUrl } from '@/components/profile/copy-mcp-url';

/** Réplica de `apps/web/src/app/(app)/profile/tokens/page.tsx`. */
export default function TokensScreen() {
  return (
    <Screen back title="Conectar com Claude">
      <View className="gap-4 p-4">
        <Text className="text-sm text-muted-foreground">
          O fatia usa OAuth para autenticar o Claude via Logto. Siga os passos abaixo para
          configurar.
        </Text>

        <Card>
          <CardHeader>
            <CardTitle>Como usar com o Claude</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            <Step number={1}>
              <Text className="text-sm text-foreground">
                Abra o <Text className="font-bold">Claude.ai</Text> → Configurações → Integrações →
                Adicionar servidor MCP.
              </Text>
            </Step>

            <Step number={2}>
              <View className="gap-1">
                <Text className="text-sm text-foreground">URL do servidor:</Text>
                {/* O PWA mostra um domínio de exemplo; no app a URL real já está
                    no ambiente, e copiar à mão de um celular é pior ainda. */}
                <CopyMcpUrl url={env.mcpUrl} />
              </View>
            </Step>

            <Step number={3}>
              <Text className="text-sm text-foreground">
                Toque em <Text className="font-bold">Conectar</Text> — o Claude abrirá uma janela de
                login Logto. Autorize o acesso com sua conta.
              </Text>
            </Step>

            <Step number={4}>
              <Text className="text-sm text-foreground">
                Salve e inicie uma conversa com Claude! 🎉
              </Text>
            </Step>
          </CardContent>
        </Card>
      </View>
    </Screen>
  );
}

function Step({ number, children }: { number: number; children: ReactNode }) {
  return (
    <View className="flex-row gap-2">
      <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
        <Text className="text-xs font-bold text-primary-foreground">{number}</Text>
      </View>
      <View className="min-w-0 flex-1">{children}</View>
    </View>
  );
}
