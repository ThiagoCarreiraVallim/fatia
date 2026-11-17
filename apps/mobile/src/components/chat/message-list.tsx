import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleX,
  Copy,
  Image as ImageIcon,
  Quote,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react-native';
import {
  AGENT_LOCAL_TOOLS,
  CHAT_FEEDBACK_REASON_LABELS,
  AI_STATES_COPY,
  FATIA_AGENT_NAME,
  aiTurnState,
  chatCardTitle,
  chatMarkdownPlainText,
  collapsedLabel,
  groupToolCalls,
  toolCallStatusOf,
  toolLineLabel,
  type ChatToolPart,
  type ToolCallStatus,
  quotaResetLabel,
  splitQuote,
  textoDeErroDoChat,
  type ChatAssistantMessage,
  type ChatPlanStep,
  type ChatReviewReason,
  type ChatStreamError,
  type ChatThreadState,
} from '@fatia/api-client';
import { Button, cn } from '@/components/ui';
import { colors } from '@/theme/colors';
import { ArtifactCard, useChatToolCatalog } from './artifact-card';
import { ChatMarkdown } from './chat-markdown';

/**
 * Uma fala da pessoa. A foto guardada (ADR 046) aparece; a que foi pelo caminho
 * antigo não ficou guardada (ADR 020), e sobra o aviso.
 */

export function UserBubble({
  text,
  photos,
  images,
}: {
  text: string;
  photos: number;
  images?: string[];
}) {
  // A citação de uma resposta vem no começo do texto (`withQuote`), e aqui se
  // desenha à parte — inclusive depois de reabrir a conversa.
  const { quote, text: fala } = splitQuote(text);
  return (
    <View className="max-w-[85%] gap-1 self-end">
      <Text className="self-end pr-1 text-xs font-semibold text-muted-foreground">Você</Text>
      <View className="rounded-3xl rounded-br-md bg-secondary px-4 py-2.5">
        {images?.length ? (
          <View className="mb-2 flex-row flex-wrap justify-end gap-2">
            {images.map((uri, i) => (
              <Image
                key={uri}
                source={{ uri }}
                accessibilityLabel={images.length > 1 ? `Foto enviada ${i + 1}` : 'Foto enviada'}
                className="size-24 rounded-lg"
                resizeMode="cover"
              />
            ))}
          </View>
        ) : null}
        {photos > 0 ? (
          <View className="mb-1 flex-row items-center gap-1">
            <ImageIcon size={12} color={colors.mutedForeground} />
            <Text className="text-xs text-muted-foreground">
              {photos === 1 ? 'Foto enviada' : `${photos} fotos enviadas`} — não fica guardada
            </Text>
          </View>
        ) : null}
        {quote ? (
          <Text
            numberOfLines={4}
            accessibilityLabel={`Citação: ${quote}`}
            className="mb-1.5 border-l-2 border-primary pl-2.5 text-xs text-muted-foreground"
          >
            {quote}
          </Text>
        ) : null}
        {fala ? (
          <Text selectable className="text-[15px] leading-6 text-foreground">
            {fala}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function AssistantBlock({
  message,
  thread,
  agentName,
  showName,
  onVote,
  onQuote,
  onExplain,
  onContinue,
  last = false,
}: {
  message: ChatAssistantMessage;
  thread: ChatThreadState;
  /** A última resposta: o cartão dela fica aberto; o das antigas recolhe numa linha. */
  last?: boolean;
  agentName: string | null;
  showName: boolean;
  onVote: (rowId: string, review: 'like' | 'dislike') => void;
  /**
   * Cita a resposta na próxima mensagem. Inteira, e não um trecho: a seleção
   * parcial de texto no React Native não é confiável; o teto da citação
   * (`CHAT_QUOTE_MAX`) corta o excesso.
   */
  onQuote?: (text: string) => void;
  /** O motivo do 👎, opcional e depois do voto. */
  onExplain?: (rowId: string, reasons: ChatReviewReason[]) => void;
  /** "Continuar" da resposta parada (prancha Al-M11, "Interrompida"). */
  onContinue?: () => void;
}) {
  const [pensamentoAberto, setPensamentoAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [motivo, setMotivo] = useState<'fechado' | 'aberto' | 'enviado'>('fechado');
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
              <ChevronDown size={14} color={colors.mutedForeground} />
            ) : (
              <ChevronRight size={14} color={colors.mutedForeground} />
            )}
            <Text className="text-xs text-muted-foreground">Raciocínio</Text>
          </View>
          {pensamentoAberto ? (
            <Text className="text-xs leading-5 text-muted-foreground">{message.reasoning}</Text>
          ) : null}
        </Pressable>
      ) : null}
      <ToolLines message={message} thread={thread} last={last} />
      {message.text ? <ChatMarkdown source={message.text} /> : null}
      {message.stopped ? (
        <View className="flex-row items-center gap-2">
          <Text className="text-xs text-muted-foreground">{AI_STATES_COPY.interrupted}</Text>
          {onContinue && last && !thread.running ? (
            <Pressable
              accessibilityRole="button"
              onPress={onContinue}
              className="min-h-[44px] justify-center px-2"
            >
              <Text className="text-xs font-semibold text-primary-text">
                {AI_STATES_COPY.continue}
              </Text>
            </Pressable>
          ) : null}
        </View>
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
              <Check size={16} color={colors.primaryText} />
            ) : (
              <Copy size={16} color={colors.mutedForeground} />
            )}
          </Pressable>
          {onQuote ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Citar resposta"
              onPress={() => onQuote(chatMarkdownPlainText(message.text))}
              className="h-11 w-11 items-center justify-center"
            >
              <Quote size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
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
                  color={message.review === 'like' ? colors.primaryText : colors.mutedForeground}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Resposta ruim"
                accessibilityState={{ selected: message.review === 'dislike' }}
                onPress={() => {
                  onVote(message.rowId!, 'dislike');
                  setMotivo('aberto');
                }}
                className="h-11 w-11 items-center justify-center"
              >
                <ThumbsDown
                  size={16}
                  color={message.review === 'dislike' ? colors.primaryText : colors.mutedForeground}
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
      {motivo !== 'fechado' && message.rowId && onExplain ? (
        <VoteReasons
          sent={motivo === 'enviado'}
          onSend={(reasons) => {
            onExplain(message.rowId!, reasons);
            setMotivo('enviado');
          }}
          onClose={() => setMotivo('fechado')}
        />
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
      <ActivityIndicator size="small" color={colors.primaryText} />
      <View className="flex-1">
        <Text className="text-sm text-muted-foreground">Pensando…</Text>
        {/* Prancha Al-M11, "Segundo plano": a resposta segue no servidor (ADR 035). */}
        <Text className="text-xs text-muted-foreground">{AI_STATES_COPY.background}</Text>
      </View>
    </View>
  );
}

export function PlanCard({ steps }: { steps: ChatPlanStep[] }) {
  return (
    <View className="gap-1.5 rounded-xl border border-border bg-card p-3">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-xs font-semibold uppercase text-muted-foreground">Plano</Text>
        <Text className="text-xs text-muted-foreground">
          {steps.filter((p) => p.status === 'done').length} de {steps.length} passos
        </Text>
      </View>
      {steps.map((p) => (
        <View key={p.id} className="flex-row items-center gap-2">
          {p.status === 'done' ? (
            <Check size={14} color={colors.primaryText} />
          ) : p.status === 'running' ? (
            <ActivityIndicator size="small" color={colors.primaryText} />
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

/**
 * O erro do turno, com o caminho que ele pede (prancha Al-M11): cota (volta tal hora, registro
 * manual), fora do ar (a mensagem ficou salva, tentar de novo), interrompida (continuar), plano.
 */
export function TurnError({
  error,
  onRetry,
  onContinue,
}: {
  error: ChatStreamError;
  onRetry: () => void;
  onContinue?: () => void;
}) {
  const router = useRouter();
  const plano = error.code === 'AI_PLAN_REQUIRED';
  const estado = aiTurnState(error.code);
  const titulo =
    estado === 'quota'
      ? AI_STATES_COPY.quotaTitle
      : estado === 'down'
        ? AI_STATES_COPY.downTitle
        : estado === 'interrupted'
          ? AI_STATES_COPY.interrupted
          : 'A resposta falhou';
  const texto =
    estado === 'quota'
      ? `${error.resetsAt ? quotaResetLabel(error.resetsAt) : textoDeErroDoChat(error)} ${AI_STATES_COPY.quotaManual}`
      : estado === 'down'
        ? AI_STATES_COPY.downBody
        : textoDeErroDoChat(error);
  return (
    <View accessibilityRole="alert" className="gap-3 rounded-xl border border-border bg-card p-4">
      <Text className="text-sm font-semibold text-foreground">{titulo}</Text>
      <Text className="text-sm text-muted-foreground">{texto}</Text>
      {plano ? (
        <Button size="sm" onPress={() => router.push('/plan')}>
          <Text className="text-sm font-bold text-primary-foreground">Ver o plano PRO</Text>
        </Button>
      ) : estado === 'quota' ? (
        <Button size="sm" variant="outline" onPress={() => router.push('/nutrition')}>
          <Text className="text-sm text-foreground">{AI_STATES_COPY.quotaAction}</Text>
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onPress={estado === 'interrupted' && onContinue ? onContinue : onRetry}
        >
          <Text className="text-sm text-foreground">
            {estado === 'interrupted' ? AI_STATES_COPY.continue : AI_STATES_COPY.downAction}
          </Text>
        </Button>
      )}
    </View>
  );
}

type Linha = { tool: ChatToolPart; status: ToolCallStatus };

/**
 * As tools de uma resposta (prancha IA-Estados): "Consultando …" enquanto roda, "· nada
 * encontrado" neutro, "· não deu certo" em vermelho com o motivo atrás de um toque, e o cartão.
 * Duas ou mais consultas seguidas fecham em "Consultei N coisas" — nunca com falha
 * (`groupToolCalls`, o mesmo do PWA).
 */
function ToolLines({
  message,
  thread,
  last,
}: {
  message: ChatAssistantMessage;
  thread: ChatThreadState;
  last: boolean;
}) {
  const [grupoAberto, setGrupoAberto] = useState<Record<number, boolean>>({});
  const linhas: Linha[] = message.tools.map((tool) => ({
    tool,
    status: toolCallStatusOf(tool, thread.artifacts[tool.id]),
  }));
  const segmentos = groupToolCalls(linhas);
  return (
    <>
      {segmentos.map((segmento, i) => {
        if (segmento.type === 'single') {
          return (
            <ToolLine key={segmento.item.tool.id} {...segmento.item} thread={thread} last={last} />
          );
        }
        // Com cartão na última resposta, o grupo nasce aberto: o cartão é o resultado.
        const temCartao = segmento.items.some((l) => thread.artifacts[l.tool.id]);
        const aberto = grupoAberto[i] ?? (last && temCartao);
        return (
          <View key={segmento.items[0]!.tool.id} className="gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: aberto }}
              onPress={() => setGrupoAberto((g) => ({ ...g, [i]: !aberto }))}
              className="min-h-[36px] flex-row items-center gap-2 self-start rounded-full bg-secondary px-3"
            >
              <Check size={14} color={colors.primaryText} />
              <Text className="text-xs font-semibold text-foreground">
                {collapsedLabel(segmento.items.length)}
              </Text>
              {aberto ? (
                <ChevronDown size={14} color={colors.mutedForeground} />
              ) : (
                <ChevronRight size={14} color={colors.mutedForeground} />
              )}
            </Pressable>
            {aberto
              ? segmento.items.map((l) => (
                  <ToolLine key={l.tool.id} {...l} thread={thread} last={last} />
                ))
              : null}
          </View>
        );
      })}
    </>
  );
}

function ToolLine({
  tool,
  status,
  thread,
  last,
}: Linha & { thread: ChatThreadState; last: boolean }) {
  const catalogo = useChatToolCatalog();
  const [aberto, setAberto] = useState(false);
  const [detalhe, setDetalhe] = useState(false);
  const local = AGENT_LOCAL_TOOLS[tool.name as keyof typeof AGENT_LOCAL_TOOLS];
  const titulo =
    thread.toolTitles[tool.name] ??
    catalogo?.[tool.name]?.title ??
    local?.title ??
    'Ação do assistente';
  const write = catalogo?.[tool.name]?.kind === 'confirm';
  const cartao = status === 'done' ? thread.artifacts[tool.id] : undefined;

  if (cartao && last) return <ArtifactCard artifact={cartao} tool={titulo} />;

  // A escrita feita diz "gravado" (o app não guarda a hora de cada fala para dizer "às 15:02").
  const rotulo = toolLineLabel(titulo, status, {
    write,
    cardTitle: cartao ? chatCardTitle(cartao) : write && status === 'done' ? 'gravado' : undefined,
  });
  return (
    <View className="gap-2">
      <Pressable
        accessibilityRole={cartao || tool.errorText ? 'button' : undefined}
        accessibilityState={cartao ? { expanded: aberto } : undefined}
        accessibilityLabel={rotulo}
        disabled={!cartao && !tool.errorText}
        onPress={() => (cartao ? setAberto((v) => !v) : setDetalhe((v) => !v))}
        className="min-h-[36px] flex-row items-center gap-2 self-start rounded-full bg-secondary px-3"
      >
        {status === 'running' ? (
          <ActivityIndicator size="small" color={colors.primaryText} />
        ) : status === 'done' ? (
          <Check size={14} color={colors.primaryText} />
        ) : status === 'error' ? (
          <CircleX size={14} color={colors.danger} />
        ) : null}
        <Text
          numberOfLines={1}
          className={cn('shrink text-xs', status === 'error' ? 'text-danger' : 'text-foreground')}
        >
          {rotulo}
        </Text>
        {status === 'error' && tool.errorText ? (
          <Text className="text-xs text-muted-foreground underline">
            {detalhe ? 'ocultar' : 'ver detalhe'}
          </Text>
        ) : null}
        {cartao ? (
          aberto ? (
            <ChevronDown size={14} color={colors.mutedForeground} />
          ) : (
            <ChevronRight size={14} color={colors.mutedForeground} />
          )
        ) : null}
      </Pressable>
      {detalhe && tool.errorText ? (
        <Text className="rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
          {tool.errorText}
        </Text>
      ) : null}
      {cartao && aberto ? <ArtifactCard artifact={cartao} tool={titulo} /> : null}
    </View>
  );
}

const MOTIVOS: ChatReviewReason[] = [
  'incorrect',
  'wrong_data',
  'incomplete',
  'did_not_follow',
  'slow',
  'other',
];

/** O "por quê" de um 👎 (prancha IA-Estados): a lista fechada, com os rótulos do PWA. */
function VoteReasons({
  sent,
  onSend,
  onClose,
}: {
  sent: boolean;
  onSend: (reasons: ChatReviewReason[]) => void;
  onClose: () => void;
}) {
  const [escolhidos, setEscolhidos] = useState<ChatReviewReason[]>([]);
  if (sent) {
    return <Text className="text-xs text-muted-foreground">Obrigado, isso ajuda a melhorar.</Text>;
  }
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-3.5">
      <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">
        O que faltou nesta resposta?
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {MOTIVOS.map((m) => {
          const ativo = escolhidos.includes(m);
          return (
            <Pressable
              key={m}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: ativo }}
              onPress={() => setEscolhidos((e) => (ativo ? e.filter((x) => x !== m) : [...e, m]))}
              className={cn(
                'min-h-[36px] justify-center rounded-full border px-3.5',
                ativo ? 'border-primary bg-primary' : 'border-border',
              )}
            >
              <Text
                className={cn('text-sm', ativo ? 'text-primary-foreground' : 'text-foreground')}
              >
                {CHAT_FEEDBACK_REASON_LABELS[m]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View className="flex-row gap-2">
        <Button className="flex-1" disabled={!escolhidos.length} onPress={() => onSend(escolhidos)}>
          Enviar
        </Button>
        <Button variant="secondary" onPress={onClose}>
          Agora não
        </Button>
      </View>
    </View>
  );
}
