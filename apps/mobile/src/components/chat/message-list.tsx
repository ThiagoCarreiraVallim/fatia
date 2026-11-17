import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  Image as ImageIcon,
  Pause,
  Quote,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react-native';
import {
  AGENT_LOCAL_TOOLS,
  CHAT_FEEDBACK_REASON_LABELS,
  chatCardTitle,
  chatMarkdownPlainText,
  collapsedLabel,
  groupToolCalls,
  toolCallStatusOf,
  toolLineLabel,
  webSearchLineLabel,
  type ChatToolPart,
  type ToolCallStatus,
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
  headline = false,
}: {
  text: string;
  photos: number;
  images?: string[];
  /**
   * A primeira fala é o assunto da conversa: grande, à direita, com uma linha embaixo (prancha
   * IA-Estados, "Sua mensagem"). As seguintes são respostas curtas, em balão (Al-M20).
   */
  headline?: boolean;
}) {
  // A citação de uma resposta vem no começo do texto (`withQuote`), e aqui se
  // desenha à parte — inclusive depois de reabrir a conversa.
  const { quote, text: fala } = splitQuote(text);
  return (
    <View
      className={cn(
        'gap-1 self-end',
        headline ? 'w-full items-end border-b border-border pb-4' : 'max-w-[85%]',
      )}
    >
      <Text className="self-end pr-1 text-xs text-muted-foreground">Você</Text>
      <View
        className={cn(
          headline ? 'max-w-[92%] pr-1' : 'rounded-3xl rounded-br-md bg-secondary px-4 py-2.5',
        )}
      >
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
          <Text
            selectable
            className={cn(
              'text-foreground',
              headline
                ? 'text-right text-[22px] font-bold leading-7 tracking-tight'
                : 'text-[15px] leading-6',
            )}
          >
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
}) {
  const [pensamentoAberto, setPensamentoAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [motivo, setMotivo] = useState<'fechado' | 'aberto' | 'enviado'>('fechado');
  return (
    <View className="gap-2">
      {/* O assistente do Fatia não se apresenta a cada resposta (prancha IA-Estados); o agente
          de uma comunidade, sim, porque a pessoa precisa saber com quem fala. */}
      {showName && agentName ? (
        <Text className="text-xs font-semibold text-primary">{agentName}</Text>
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
      {/* O texto vem antes das linhas e dos cartões, como no PWA (prancha IA-Estados). */}
      {message.text ? <ChatMarkdown source={message.text} /> : null}
      <ToolLines message={message} thread={thread} last={last} />
      {message.stopped ? (
        <View className={CAIXA_DA_LINHA}>
          <LineBadge kind="stopped" />
          <Text className="flex-1 text-[13.5px] text-muted-foreground">Resposta interrompida</Text>
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
      <Text className="text-sm text-muted-foreground">Pensando…</Text>
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
  // A escrita à espera do sim já está no cartão da pausa: uma linha "rodando" só repetiria.
  const esperando = new Set(thread.interrupt?.value.actions.map((a) => a.toolCallId) ?? []);
  const linhas: Linha[] = message.tools
    .filter((tool) => !(tool.status === 'running' && esperando.has(tool.id)))
    .map((tool) => ({
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
              accessibilityLabel={collapsedLabel(segmento.items.length)}
              className={CAIXA_DA_LINHA}
            >
              <LineBadge kind="done" />
              <LineLabel text={collapsedLabel(segmento.items.length)} failed={false} />
              <ChevronDown
                size={16}
                color={colors.mutedForeground}
                style={aberto ? { transform: [{ rotate: '180deg' }] } : undefined}
              />
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

  const busca = tool.name === 'web_search';
  const aviso =
    busca && (status === 'running' || status === 'done' || status === 'empty') ? (
      <Text className="px-1 text-xs text-muted-foreground">
        Só a pergunta vai a um serviço de busca, sem seu nome nem seus dados.
      </Text>
    ) : null;

  if (cartao && last) {
    return (
      <View className="gap-2">
        <ArtifactCard artifact={cartao} tool={titulo} />
        {aviso}
      </View>
    );
  }

  // A escrita feita diz "gravado" (o app não guarda a hora de cada fala para dizer "às 15:02").
  const rotulo = busca
    ? webSearchLineLabel(status, cartao?.kind === 'sources' ? cartao.sources.length : undefined)
    : toolLineLabel(titulo, status, {
        write,
        cardTitle: cartao
          ? chatCardTitle(cartao)
          : write && status === 'done'
            ? 'gravado'
            : undefined,
      });
  return (
    <View className="gap-2">
      <Pressable
        accessibilityRole={cartao || tool.errorText ? 'button' : undefined}
        accessibilityState={cartao ? { expanded: aberto } : undefined}
        accessibilityLabel={rotulo}
        disabled={!cartao && !tool.errorText}
        onPress={() => (cartao ? setAberto((v) => !v) : setDetalhe((v) => !v))}
        className={CAIXA_DA_LINHA}
      >
        <LineBadge
          kind={
            status === 'running'
              ? 'running'
              : status === 'done'
                ? 'done'
                : status === 'error'
                  ? 'error'
                  : status === 'empty'
                    ? 'empty'
                    : 'neutral'
          }
        />
        <LineLabel text={rotulo} failed={status === 'error'} />
        {status === 'error' && tool.errorText ? (
          <Text className="text-xs text-muted-foreground underline">
            {detalhe ? 'ocultar' : 'ver detalhe'}
          </Text>
        ) : null}
        {cartao ? (
          <ChevronDown
            size={16}
            color={colors.mutedForeground}
            style={aberto ? { transform: [{ rotate: '180deg' }] } : undefined}
          />
        ) : null}
      </Pressable>
      {aviso}
      {detalhe && tool.errorText ? (
        <Text className="rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
          {tool.errorText}
        </Text>
      ) : null}
      {cartao && aberto ? <ArtifactCard artifact={cartao} tool={titulo} /> : null}
    </View>
  );
}

/** A caixa da linha: pílula cinza da largura da conversa (prancha IA-Estados, "Consultando"). */
const CAIXA_DA_LINHA =
  'min-h-[40px] w-full flex-row items-center gap-2.5 rounded-2xl bg-secondary px-3 py-2.5';

/** "Título · resultado": o resultado em destaque, como na prancha IA-Estados. */
function LineLabel({ text, failed }: { text: string; failed: boolean }) {
  const corte = text.indexOf(' · ');
  // "Consultei 3 coisas": a contagem em destaque.
  const contagem = corte < 0 ? /^(\D*)(\d.*)$/.exec(text) : null;
  const [antes, depois] =
    corte >= 0
      ? [`${text.slice(0, corte)} · `, text.slice(corte + 3)]
      : contagem
        ? [contagem[1]!, contagem[2]!]
        : [text, ''];
  return (
    <Text className="flex-1 text-[13.5px] text-muted-foreground">
      {antes}
      {depois ? (
        <Text className={cn('font-semibold', failed ? 'text-danger' : 'text-foreground')}>
          {depois}
        </Text>
      ) : null}
    </Text>
  );
}

/** O selo redondo à esquerda da linha: ✓, vazio, erro, rodando ou interrompida. */
function LineBadge({
  kind,
}: {
  kind: 'done' | 'empty' | 'error' | 'running' | 'neutral' | 'stopped';
}) {
  if (kind === 'running') return <ActivityIndicator size="small" color={colors.primaryText} />;
  return (
    <View
      className={cn(
        'size-6 items-center justify-center rounded-full',
        kind === 'done' ? 'bg-primary/15' : kind === 'error' ? 'bg-danger/15' : 'bg-foreground/10',
      )}
    >
      {kind === 'done' ? <Check size={14} color={colors.primaryText} /> : null}
      {kind === 'error' ? <CircleAlert size={14} color={colors.danger} /> : null}
      {kind === 'empty' ? <X size={14} color={colors.mutedForeground} /> : null}
      {kind === 'stopped' ? <Pause size={14} color={colors.mutedForeground} /> : null}
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
                ativo ? 'border-primary bg-primary' : 'border-transparent bg-secondary',
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
        <Button
          variant="ink"
          className="flex-1"
          disabled={!escolhidos.length}
          onPress={() => onSend(escolhidos)}
        >
          <Text className="text-sm font-bold text-background">Enviar</Text>
        </Button>
        <Button variant="secondary" onPress={onClose}>
          <Text className="text-sm font-semibold text-secondary-foreground">Agora não</Text>
        </Button>
      </View>
    </View>
  );
}
