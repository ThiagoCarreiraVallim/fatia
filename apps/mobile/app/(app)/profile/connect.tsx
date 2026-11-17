import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useQuery } from '@tanstack/react-query';
import {
  AI_PROVIDER_OPTIONS,
  CONNECT_AI_TUTORIAL_ID,
  CONNECT_PRIVACY_NOTE,
  CONNECTED_EXAMPLE,
  connectedFootnote,
  connectedTitle,
  connectionFor,
  connectSteps,
  failureChecks,
  initialProvider,
  mcpConnectionsApi,
  NO_MCP_BODY,
  NO_MCP_TITLE,
  usersApi,
  VERIFY_HINT,
  VERIFY_PROMPT,
  type AiProvider,
} from '@fatia/api-client';
import { useAiMenu } from '@/components/layout/ai-menu';
import { Screen } from '@/components/layout/screen';
import { Badge } from '@/components/ui/badge';
import { Button, Segmented } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui/utils';
import { useExportData } from '@/components/you/use-export-data';
import { colors } from '@/theme/colors';

/** O que fica no lugar do teste: a prancha troca um pelo outro (Al-V6b, tweak `stt`). */
type Panel = 'test' | 'fail' | 'no-mcp';

/**
 * Conectar sua IA (pranchas Al-V6 a Al-V6e, #388) — réplica de
 * `apps/web/src/components/profile/connect-ai-screen.tsx`. O endereço vem da API
 * (configuração do servidor). Voltar do app do Claude ou do ChatGPT para cá
 * busca as conexões de novo, e o "Conectado" aparece sozinho.
 */
export default function ConnectAiScreen() {
  const router = useRouter();
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const mcp = useQuery({
    queryKey: ['users', 'me', 'mcp-connections'],
    queryFn: () => mcpConnectionsApi.overview(),
    staleTime: 0,
  });
  const ai = useAiMenu();
  const exportData = useExportData();

  const { refetch } = mcp;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch();
    });
    return () => sub.remove();
  }, [refetch]);

  const [provider, setProvider] = useState<AiProvider | null>(null);
  const [openStep, setOpenStep] = useState(0);
  const [panel, setPanel] = useState<Panel>('test');
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sair da tela logo depois de copiar não pode deixar um timer mexendo no estado.
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const connections = mcp.data?.connections ?? [];
  const current = provider ?? initialProvider(connections);
  const email = me.data?.email ?? null;
  const serverUrl = mcp.data?.serverUrl ?? null;
  const steps = connectSteps(current, email);
  const connection = connectionFor(current, connections);

  const pick = (next: AiProvider) => {
    setProvider(next);
    setOpenStep(0);
    setPanel('test');
    setCopied(false);
  };

  async function copyAddress() {
    if (!serverUrl) return;
    await Clipboard.setStringAsync(serverUrl);
    setCopied(true);
    // Copiou: o próximo passo é entrar e autorizar, com o e-mail desta conta.
    setOpenStep(steps.length - 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2500);
  }

  return (
    <Screen>
      <View className="gap-3.5 px-6 pb-8 pt-2">
        <View className="flex-row items-center gap-2">
          <Badge variant="done">grátis</Badge>
          <Text className="flex-1 text-[13px] text-muted-foreground">
            Funciona no Claude, no ChatGPT e em outros apps com MCP
          </Text>
        </View>

        <Text
          accessibilityRole="header"
          className="font-display-semibold text-[22px] text-foreground"
        >
          Registre e consulte conversando com a sua IA
        </Text>

        <View className="gap-2">
          <Text className="text-[13px] text-muted-foreground">Qual IA você usa?</Text>
          <Segmented
            label="Qual IA você usa?"
            options={AI_PROVIDER_OPTIONS}
            value={current}
            onChange={pick}
          />
        </View>

        <View className="gap-2">
          {steps.map((step, i) => {
            const open = i === openStep;
            return (
              <Pressable
                key={step.title}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                onPress={() => setOpenStep(i)}
                className={cn(
                  'flex-row items-start gap-3 rounded-card bg-card p-3.5 active:opacity-80',
                  open && 'border-[1.5px] border-primary/45',
                )}
              >
                <View
                  className={cn(
                    'h-7 w-7 items-center justify-center rounded-full',
                    i <= openStep ? 'bg-primary/15' : 'bg-muted',
                  )}
                >
                  <Text
                    className={cn(
                      'font-sans-extrabold text-[13px]',
                      i <= openStep ? 'text-primary-text' : 'text-muted-foreground',
                    )}
                  >
                    {i + 1}
                  </Text>
                </View>
                <View className="flex-1 gap-1.5 pt-1">
                  <Text className="font-sans-bold text-[15px] text-foreground">{step.title}</Text>
                  {open ? (
                    <Text className="text-[14px] text-muted-foreground">{step.detail}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View className="flex-row items-center gap-2 rounded-[14px] border border-border bg-card py-1.5 pl-4 pr-1.5">
          <Text selectable numberOfLines={1} className="flex-1 text-[13px] text-primary-text">
            {serverUrl ?? '…'}
          </Text>
          <Button
            size="xs"
            disabled={!serverUrl}
            onPress={() => void copyAddress()}
            accessibilityLabel={copied ? 'Endereço copiado' : 'Copiar endereço'}
          >
            <Icon name={copied ? 'check' : 'layers'} size={16} color={colors.primaryForeground} />
            <Text className="font-sans-bold text-[13px] text-primary-foreground">
              {copied ? 'Copiado' : 'Copiar'}
            </Text>
          </Button>
        </View>
        {mcp.isError ? (
          <Text className="text-[13px] text-muted-foreground">
            Não deu para carregar o endereço. Tente de novo em instantes.
          </Text>
        ) : null}

        {connection ? (
          <View
            accessibilityLabel={connectedTitle(current, connection)}
            className="gap-2.5 rounded-card border border-primary/35 bg-primary/10 p-4"
          >
            <View className="flex-row items-center gap-2">
              <Icon name="check" size={16} color={colors.primaryText} />
              <Text className="font-sans-bold text-[15px] text-foreground">
                {connectedTitle(current, connection)}
              </Text>
            </View>
            <Text className="text-[14px] text-foreground">
              <Text className="text-[14px] text-muted-foreground">
                Pergunte “{VERIFY_PROMPT}” e ele responde algo como:{' '}
              </Text>
              {CONNECTED_EXAMPLE}
            </Text>
            <Text className="text-[13px] text-muted-foreground">
              {connectedFootnote(connection.lastUsedAt)}
            </Text>
          </View>
        ) : panel === 'test' ? (
          <>
            <View className="gap-1.5 rounded-card bg-surface-3 p-3.5">
              <Text className="font-sans-bold text-[15px] text-foreground">
                Teste: “{VERIFY_PROMPT}”
              </Text>
              <Text className="text-[13px] text-muted-foreground">{VERIFY_HINT}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPanel('fail')}
              hitSlop={10}
              className="self-start"
            >
              <Text className="font-sans-semibold text-[14px] text-primary-text">
                Não funcionou?
              </Text>
            </Pressable>
          </>
        ) : panel === 'fail' ? (
          <View className="gap-2.5 rounded-card border border-warning/45 bg-card p-4">
            <PanelHeader
              icon="alert"
              color={colors.warning}
              title="Não funcionou"
              onClose={setPanel}
            />
            <View className="gap-2">
              {failureChecks(current, serverUrl ?? '', email).map((check) => (
                <View key={check} className="flex-row gap-2">
                  <Text className="text-[14px] text-foreground">•</Text>
                  <Text className="flex-1 text-[14px] text-foreground">{check}</Text>
                </View>
              ))}
            </View>
            <Button
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/you/help',
                  params: { tutorial: CONNECT_AI_TUTORIAL_ID },
                } as never)
              }
            >
              Ver o tutorial
            </Button>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPanel('no-mcp')}
              hitSlop={10}
              className="self-center"
            >
              <Text className="font-sans-semibold text-[13px] text-muted-foreground">
                Meu app não aceita MCP
              </Text>
            </Pressable>
          </View>
        ) : (
          <View className="gap-2.5 rounded-card bg-card p-4">
            <PanelHeader
              icon="info"
              color={colors.mutedForeground}
              title={NO_MCP_TITLE}
              onClose={setPanel}
            />
            <Text className="text-[14px] text-muted-foreground">{NO_MCP_BODY}</Text>
            <View className="flex-row gap-2">
              <Button variant="secondary" className="flex-1" onPress={ai.open}>
                Usar a IA do Fatia
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                loading={exportData.isPending}
                onPress={() => exportData.mutate()}
              >
                Exportar dados
              </Button>
            </View>
          </View>
        )}

        <Text className="text-[13px] text-muted-foreground">{CONNECT_PRIVACY_NOTE}</Text>
      </View>
    </Screen>
  );
}

function PanelHeader({
  icon,
  color,
  title,
  onClose,
}: {
  icon: 'alert' | 'info';
  color: string;
  title: string;
  onClose: (panel: Panel) => void;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <Icon name={icon} size={16} color={color} />
      <Text className="flex-1 font-sans-bold text-[15px] text-foreground">{title}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voltar ao teste"
        onPress={() => onClose('test')}
        className="-m-2 h-11 w-11 items-center justify-center"
      >
        <Icon name="x" size={16} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}
