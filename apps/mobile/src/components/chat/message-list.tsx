import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleX,
  Copy,
  Image as ImageIcon,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react-native';
import {
  FATIA_AGENT_NAME,
  chatMarkdownPlainText,
  textoDeErroDoChat,
  type ChatAssistantMessage,
  type ChatPlanStep,
  type ChatStreamError,
  type ChatThreadState,
} from '@fatia/api-client';
import { Button, cn } from '@/components/ui';
import { cores } from '@/theme/cores';
import { ArtifactCard } from './artifact-card';
import { ChatMarkdown } from './chat-markdown';

/** Uma fala da pessoa. A foto não fica guardada (ADR 004): sobra o aviso. */
export function UserBubble({ text, photos }: { text: string; photos: number }) {
  return (
    <View className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-secondary px-4 py-2.5">
      {photos > 0 ? (
        <View className="mb-1 flex-row items-center gap-1">
          <ImageIcon size={12} color={cores.mutedForeground} />
          <Text className="text-xs text-muted-foreground">
            {photos === 1 ? 'Foto enviada' : `${photos} fotos enviadas`} — não fica guardada
          </Text>
        </View>
      ) : null}
      <Text selectable className="text-[15px] leading-6 text-foreground">
        {text}
      </Text>
    </View>
  );
}

export function AssistantBlock({
  message,
  thread,
  agentName,
  showName,
  onVote,
}: {
  message: ChatAssistantMessage;
  thread: ChatThreadState;
  agentName: string | null;
  showName: boolean;
  onVote: (rowId: string, review: 'like' | 'dislike') => void;
}) {
  const [pensamentoAberto, setPensamentoAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  return (
    <View className="gap-2">
      {showName ? (
        <Text className="text-xs font-semibold text-primary">{agentName ?? FATIA_AGENT_NAME}</Text>
      ) : null}
      {message.reasoning ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: pensamentoAberto }}
          onPress={() => setPensamentoAberto((v) => !v)}
          className="gap-1"
        >
          <View className="flex-row items-center gap-1">
            {pensamentoAberto ? (
              <ChevronDown size={14} color={cores.mutedForeground} />
            ) : (
              <ChevronRight size={14} color={cores.mutedForeground} />
            )}
            <Text className="text-xs text-muted-foreground">Raciocínio</Text>
          </View>
          {pensamentoAberto ? (
            <Text className="text-xs leading-5 text-muted-foreground">{message.reasoning}</Text>
          ) : null}
        </Pressable>
      ) : null}
      {message.tools.map((tool) => (
        <View key={tool.id} className="gap-2">
          <View
            accessibilityLabel={`${thread.toolTitles[tool.name] ?? tool.name}: ${
              tool.status === 'running'
                ? 'em andamento'
                : tool.status === 'success'
                  ? 'feito'
                  : 'não deu certo'
            }`}
            className="flex-row items-center gap-2 self-start rounded-full border border-border px-3 py-1"
          >
            {tool.status === 'running' ? (
              <ActivityIndicator size="small" color={cores.primary} />
            ) : tool.status === 'success' ? (
              <Check size={14} color={cores.primary} />
            ) : (
              <CircleX size={14} color={cores.mutedForeground} />
            )}
            <Text className="text-xs text-foreground">
              {thread.toolTitles[tool.name] ?? tool.name}
            </Text>
          </View>
          {tool.status === 'error' && tool.errorText ? (
            <Text className="text-xs text-muted-foreground">{tool.errorText}</Text>
          ) : null}
          {thread.artifacts[tool.id] ? <ArtifactCard artifact={thread.artifacts[tool.id]} /> : null}
        </View>
      ))}
      {message.text ? <ChatMarkdown source={message.text} /> : null}
      {message.stopped ? (
        <Text className="text-xs text-muted-foreground">Resposta interrompida</Text>
      ) : null}
      {message.text && !thread.running ? (
        <View className="flex-row items-center gap-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copiado ? 'Copiado' : 'Copiar resposta'}
            onPress={() => {
              void Clipboard.setStringAsync(chatMarkdownPlainText(message.text));
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1500);
            }}
            className="h-11 w-11 items-center justify-center"
          >
            {copiado ? (
              <Check size={16} color={cores.primary} />
            ) : (
              <Copy size={16} color={cores.mutedForeground} />
            )}
          </Pressable>
          {message.rowId ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Boa resposta"
                accessibilityState={{ selected: message.review === 'like' }}
                onPress={() => onVote(message.rowId!, 'like')}
                className="h-11 w-11 items-center justify-center"
              >
                <ThumbsUp
                  size={16}
                  color={message.review === 'like' ? cores.primary : cores.mutedForeground}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Resposta ruim"
                accessibilityState={{ selected: message.review === 'dislike' }}
                onPress={() => onVote(message.rowId!, 'dislike')}
                className="h-11 w-11 items-center justify-center"
              >
                <ThumbsDown
                  size={16}
                  color={message.review === 'dislike' ? cores.primary : cores.mutedForeground}
                />
              </Pressable>
            </>
          ) : null}
          {message.durationMs ? (
            <Text className="text-xs text-muted-foreground">
              {(message.durationMs / 1000).toFixed(1).replace('.', ',')} s
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function Thinking() {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Pensando"
      className="flex-row items-center gap-2"
    >
      <ActivityIndicator size="small" color={cores.primary} />
      <Text className="text-sm text-muted-foreground">Pensando…</Text>
    </View>
  );
}

export function PlanCard({ steps }: { steps: ChatPlanStep[] }) {
  return (
    <View className="gap-1.5 rounded-xl border border-border bg-card p-3">
      <Text className="text-xs font-semibold uppercase text-muted-foreground">Plano</Text>
      {steps.map((p) => (
        <View key={p.id} className="flex-row items-center gap-2">
          {p.status === 'done' ? (
            <Check size={14} color={cores.primary} />
          ) : p.status === 'running' ? (
            <ActivityIndicator size="small" color={cores.primary} />
          ) : (
            <View className="h-3.5 w-3.5 rounded-full border border-border" />
          )}
          <Text
            className={cn(
              'flex-1 text-sm',
              p.status === 'done' ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {p.title}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** O erro do turno, com o caminho que ele pede: tentar de novo, ou o plano PRO. */
export function TurnError({ error, onRetry }: { error: ChatStreamError; onRetry: () => void }) {
  const router = useRouter();
  const plano = error.code === 'AI_PLAN_REQUIRED';
  const cota = error.code === 'AI_QUOTA_EXCEEDED';
  return (
    <View accessibilityRole="alert" className="gap-3 rounded-xl border border-border bg-card p-4">
      <Text className="text-sm font-semibold text-foreground">A resposta falhou</Text>
      <Text className="text-sm text-muted-foreground">{textoDeErroDoChat(error)}</Text>
      {plano ? (
        <Button size="sm" onPress={() => router.push('/plan')}>
          <Text className="text-sm font-bold text-primary-foreground">Ver o plano PRO</Text>
        </Button>
      ) : cota ? null : (
        <Button size="sm" variant="outline" onPress={onRetry}>
          <Text className="text-sm text-foreground">Tentar de novo</Text>
        </Button>
      )}
    </View>
  );
}
