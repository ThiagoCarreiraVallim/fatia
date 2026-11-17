'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CameraIcon,
  CheckIcon,
  CopyIcon,
  LoaderCircleIcon,
  MicIcon,
  SquareIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  XIcon,
} from 'lucide-react';
import {
  ActionBarPrimitive,
  AuiIf,
  MessagePrimitive,
  ThreadPrimitive,
  unstable_useMessageStallDetection,
  useAui,
  useAuiState,
} from '@assistant-ui/react';
import { useLangGraphInterruptState } from '@assistant-ui/react-langgraph';
import Link from 'next/link';
import {
  AI_STATES_COPY,
  aiTurnState,
  erroDoChat,
  planHref,
  quotaResetLabel,
  stopChatRun,
  textoDeErroDoChat,
  withQuote,
  CHAT_CONTINUE_MESSAGE,
} from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { LiveJoin } from './live-join';
import { DrawerMessage } from './drawer-message';
import { field, ghostButton } from '@/components/elements/surfaces';
import {
  EmptyState,
  EmptyStateGreeting,
  EmptyStateSuggestion,
  EmptyStateSuggestions,
} from '@/components/elements/empty-state';
import { ErrorState } from '@/components/elements/error-state';
import { ThinkingIndicator } from '@/components/elements/thinking-indicator';
import { MobileComposer } from '@/components/elements/mobile-composer';
import { MessageTiming } from '@/components/elements/message-timing';
import { StoppedRun } from '@/components/elements/stopped-run';
import { Conversation, ConversationContent, ConversationScrollButton } from './conversation';
import { AssistantReasoning, TextoDoAssistente, ToolCallGroup, ToolCallPart } from './partes';
import { PausaDoAgente } from './pausa';
import { MotivoDoVoto } from './motivo-do-voto';
import { PlanoDoTurno } from './plano';
import { AvisoDeCota, useCotaEsgotada } from './cota';
import { AnexosDaMensagem, AnexosDoComposer, FotoDaFala } from './anexos';
import { failedQuestion, canDrainQueue, useMessageQueue, type ItemDaFila } from './fila';
import { BarraDeCitacao, CitacaoDoComposer, TextoDaPessoa } from './citacao';
import { ChatConsentSheet, useChatUnlocked } from './aceite';
import { CHAVE_DOS_ACEITES } from './catalogo';
import { PilulasDeResposta } from './pilulas';
import {
  useConversaAberta,
  useDisponibilidadeDoChat,
  useIsStopped,
  useMarkStopped,
  useTurnError,
  useTurnTiming,
} from './chat-runtime-provider';
import { timingStats } from './turn-timing';
import { useDitado } from './use-ditado';
import { AutorDaResposta, SeletorDeAgente } from './agente';

/**
 * A conversa, sobre os primitivos do assistant-ui.
 *
 * O que continua nosso, e por quê: a rolagem (`./conversation`, sobre
 * `use-stick-to-bottom`), o composer de celular (`MobileComposer`, que é o que
 * mantém o campo acima da barra de navegação — #255) e o corpo da resposta, no
 * `streamdown`. O runtime é quem é dono do estado: mensagens, tools, pausa e
 * cancelamento.
 */

const SUGESTOES = [
  'O que eu comi hoje?',
  // Uma de escrita: é a capacidade que a ADR 022 abriu, e ninguém descobre
  // sozinho que dá para pedir — o chat parecia só consultar.
  'Registra 200 g de frango no almoço',
  'Qual foi meu último treino de peito?',
] as const;

function MensagemDaPessoa() {
  // A primeira fala é o assunto da conversa: grande, à direita, com uma linha embaixo (prancha
  // IA-Estados, "Sua mensagem"). As seguintes são respostas curtas, em balão (Al-M20).
  const assunto = useAuiState((s) => s.thread.messages[0]?.id === s.message.id);
  return (
    // Citar é para a resposta: a própria fala a pessoa reescreve.
    <MessagePrimitive.Root
      data-aui-quote-selectable="false"
      className={cn(
        'flex w-full flex-col items-end gap-2',
        assunto && 'border-b border-foreground/10 pb-4',
      )}
    >
      <span className="pr-1 text-xs text-foreground/50">Você</span>
      <AnexosDaMensagem />
      {/* `field`, e não `paper`: nesta paleta `paper` fica a 2,5% de
          luminosidade do fundo, e o balão sumiria. */}
      <div
        className={cn(
          'whitespace-pre-wrap',
          assunto
            ? 'max-w-[92%] pr-1 text-right text-[22px] font-bold leading-tight tracking-tight'
            : cn(
                field,
                'max-w-[85%] rounded-3xl rounded-br-lg px-4 py-2.5 text-[15px] leading-relaxed',
              ),
        )}
      >
        <MessagePrimitive.Parts components={{ Text: TextoDaPessoa, Image: FotoDaFala }} />
      </div>
    </MessagePrimitive.Root>
  );
}

/**
 * O cartão de erro, no texto do código — nunca a prosa do servidor. `answerId` é a resposta
 * que falhou: "Tentar de novo" reenvia a pergunta dela, e não a última da conversa.
 */
function FailedAnswer({ error, answerId }: { error: unknown; answerId?: string }) {
  const lastQuestion = useAuiState((s) => failedQuestion(s.thread.messages, answerId));
  const aui = useAui();
  const erro = erroDoChat(error);
  // O plano acabou no meio da conversa (ADR 024): tentar de novo daria o mesmo 402.
  if (erro.code === 'AI_PLAN_REQUIRED') {
    return (
      <div role="alert" className={cn(field, 'w-full space-y-2 rounded-2xl px-4 py-3 text-sm')}>
        <p>{textoDeErroDoChat(erro)}</p>
        <Link href={planHref('chat')} className="font-semibold text-primary underline">
          Ver o plano PRO
        </Link>
      </div>
    );
  }
  const estado = aiTurnState(erro.code);
  // Prancha Al-M11, "Cota": volta tal hora, e o registro manual segue — tentar de novo não adianta.
  if (estado === 'quota') {
    return (
      <div role="alert" className={cn(field, 'w-full space-y-2 rounded-2xl px-4 py-3 text-sm')}>
        <p className="font-semibold text-foreground">{AI_STATES_COPY.quotaTitle}</p>
        <p className="text-foreground/75">
          {erro.resetsAt ? quotaResetLabel(erro.resetsAt) : textoDeErroDoChat(erro)}{' '}
          {AI_STATES_COPY.quotaManual}
        </p>
        <Link href="/nutrition" className="font-semibold text-success underline">
          {AI_STATES_COPY.quotaAction}
        </Link>
      </div>
    );
  }
  const foraDoAr = estado === 'down';
  const interrompida = estado === 'interrupted';
  return (
    <ErrorState
      className="max-w-none"
      title={
        foraDoAr
          ? AI_STATES_COPY.downTitle
          : interrompida
            ? AI_STATES_COPY.interrupted
            : 'A resposta falhou'
      }
      detail={foraDoAr ? AI_STATES_COPY.downBody : textoDeErroDoChat(erro)}
      retryLabel={interrompida ? AI_STATES_COPY.continue : 'Tentar de novo'}
      // Reenvia a pergunta como mensagem nova: o estado da conversa está no
      // agente, e refazer "o turno do meio" exigiria bifurcar o checkpoint.
      onRetry={() => {
        if (lastQuestion) aui.thread().append(lastQuestion);
      }}
    />
  );
}

function ErroDaResposta() {
  const status = useAuiState((s) => s.message.status);
  const id = useAuiState((s) => s.message.id);
  if (status?.type !== 'incomplete' || status.reason !== 'error') return null;
  return <FailedAnswer error={status.error} answerId={id} />;
}

/**
 * O erro de um turno que não chegou a ter resposta — cota, provedor fora.
 *
 * Fica no fim da conversa, logo abaixo da pergunta, porque não existe mensagem do
 * assistente onde pendurá-lo (ver `separateTurnError`).
 */
function TurnErrorNotice() {
  const error = useTurnError();
  const running = useAuiState((s) => s.thread.isRunning);
  if (!error || running) return null;
  return <FailedAnswer error={error} />;
}

/**
 * O "pensando": antes do primeiro token, e de novo quando a resposta trava no
 * meio — o modelo decidindo uma tool, ou o provedor lento. Sem a segunda parte, o
 * texto parava por dez segundos e a tela parecia congelada.
 */
function Pensando() {
  const rodando = useAuiState((s) => s.message.status?.type === 'running');
  // O raciocínio conta: o painel dele já diz "Pensando…", e dois avisos de
  // espera empilhados é ruído.
  const temConteudo = useAuiState((s) =>
    s.message.parts.some(
      (parte) => (parte.type === 'text' || parte.type === 'reasoning') && parte.text.trim() !== '',
    ),
  );
  const { stalled } = unstable_useMessageStallDetection({ thresholdMs: 2500 });
  if (!rodando || (temConteudo && !stalled)) return null;
  // `aria-label` além do rótulo visível: é o nome estável pelo qual o leitor de
  // tela encontra o único retorno entre apertar enviar e o primeiro token.
  return (
    <div className="flex flex-col gap-1">
      <ThinkingIndicator aria-label="Pensando" label="Pensando" />
      {/* Prancha Al-M11, "Segundo plano": a resposta segue no servidor (ADR 035). */}
      {temConteudo ? null : (
        <p className="text-xs text-muted-foreground">{AI_STATES_COPY.background}</p>
      )}
    </div>
  );
}

/** "Resposta interrompida" e o tempo da resposta, quando ela já não está chegando. */
function AnswerFooter() {
  const id = useAuiState((s) => s.message.id);
  const running = useAuiState((s) => s.message.status?.type === 'running');
  const stopped = useIsStopped(id);
  const stats = timingStats(useTurnTiming(id));
  if (running) return null;
  if (stopped) return <ContinuarParada />;
  return <MessageTiming stats={stats} />;
}

/** Prancha Al-M11, "Interrompida": a etiqueta e o "Continuar", que pede o resto da resposta. */
function ContinuarParada() {
  const aui = useAui();
  const rodando = useAuiState((s) => s.thread.isRunning);
  return (
    <span className="flex items-center gap-2">
      <StoppedRun reason={AI_STATES_COPY.interrupted} />
      {rodando ? null : (
        <button
          type="button"
          onClick={() => aui.thread().append(CHAT_CONTINUE_MESSAGE)}
          className="rounded-full px-3 py-1 text-xs font-semibold text-success hover:bg-foreground/[0.04]"
        >
          {AI_STATES_COPY.continue}
        </button>
      )}
    </span>
  );
}

function BarraDeAcoes() {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex items-center gap-1 text-foreground/50"
    >
      <ActionBarPrimitive.Copy
        aria-label="Copiar resposta"
        className={cn(ghostButton, 'rounded-md p-1.5')}
      >
        <AuiIf condition={(s) => s.message.isCopied}>
          <CheckIcon size={14} aria-hidden />
        </AuiIf>
        <AuiIf condition={(s) => !s.message.isCopied}>
          <CopyIcon size={14} aria-hidden />
        </AuiIf>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.FeedbackPositive
        aria-label="Resposta boa"
        className={cn(ghostButton, 'rounded-md p-1.5 data-[submitted]:text-success')}
      >
        <ThumbsUpIcon size={14} aria-hidden />
      </ActionBarPrimitive.FeedbackPositive>
      <ActionBarPrimitive.FeedbackNegative
        aria-label="Resposta ruim"
        className={cn(ghostButton, 'rounded-md p-1.5 data-[submitted]:text-danger')}
      >
        <ThumbsDownIcon size={14} aria-hidden />
      </ActionBarPrimitive.FeedbackNegative>
    </ActionBarPrimitive.Root>
  );
}

function MensagemDoAssistente() {
  return (
    <MessagePrimitive.Root className="flex w-full flex-col items-start gap-3">
      <AutorDaResposta />
      <MessagePrimitive.Parts
        components={{
          Text: TextoDoAssistente,
          Reasoning: AssistantReasoning,
          tools: { Fallback: ToolCallPart },
          ToolGroup: ToolCallGroup,
        }}
      />
      <Pensando />
      <ErroDaResposta />
      <AnswerFooter />
      <BarraDeAcoes />
    </MessagePrimitive.Root>
  );
}

function Boas() {
  const aui = useAui();
  return (
    <EmptyState className="my-auto max-w-none self-center">
      <EmptyStateGreeting>Por onde começamos?</EmptyStateGreeting>
      <SeletorDeAgente />
      <EmptyStateSuggestions>
        {SUGESTOES.map((sugestao, indice) => (
          <EmptyStateSuggestion
            key={sugestao}
            index={indice}
            // A borda é acréscimo nosso: sem ela, nesta paleta, a pílula não se
            // lê como algo em que dá para tocar.
            className="border border-border"
            onClick={() => {
              aui.composer().setText(sugestao);
              aui.composer().send();
            }}
          >
            {sugestao}
          </EmptyStateSuggestion>
        ))}
      </EmptyStateSuggestions>
    </EmptyState>
  );
}

/**
 * Um anúncio por resposta para o leitor de tela, e não um por token.
 *
 * O log da conversa fica com `aria-live="off"`: com ele ligado, cada token seria
 * lido em voz alta, e uma resposta de três parágrafos viraria dezenas de
 * interrupções.
 */
function Anuncio() {
  const rodando = useAuiState((s) => s.thread.isRunning);
  const [texto, setTexto] = useState('');
  const estava = useRef(false);
  useEffect(() => {
    if (rodando && !estava.current) setTexto('');
    if (!rodando && estava.current) setTexto('Resposta recebida.');
    estava.current = rodando;
  }, [rodando]);
  return (
    <p aria-live="polite" className="sr-only">
      {texto}
    </p>
  );
}

function BotaoDeFoto({ disabled }: { disabled: boolean }) {
  const aui = useAui();
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        hidden
        aria-hidden
        tabIndex={-1}
        data-testid="entrada-de-foto"
        onChange={(evento) => {
          const arquivo = evento.target.files?.[0];
          evento.target.value = '';
          if (arquivo) void aui.composer().addAttachment(arquivo);
        }}
      />
      <button
        type="button"
        aria-label="Anexar foto"
        disabled={disabled}
        onClick={() => entrada.current?.click()}
        className={cn(ghostButton, 'size-9 shrink-0 rounded-full disabled:opacity-40')}
      >
        <CameraIcon size={18} aria-hidden />
      </button>
    </>
  );
}

function BotaoDeDitado({
  disabled,
  onAviso,
  onGravando,
}: {
  disabled: boolean;
  onAviso: (aviso: string | null) => void;
  onGravando: (gravando: boolean) => void;
}) {
  const aui = useAui();
  const queryClient = useQueryClient();
  const ditado = useDitado(
    (texto) => {
      const atual = aui.composer().getState().text;
      aui.composer().setText(atual.trim() ? `${atual.trimEnd()} ${texto}` : texto);
      onAviso(null);
    },
    (mensagem) => onAviso(mensagem),
    // Sem aceite (#384): relê o estado, e o aceite toma o lugar do campo.
    () => {
      onAviso(null);
      void queryClient.invalidateQueries({ queryKey: CHAVE_DOS_ACEITES });
    },
  );
  const gravando = ditado.estado === 'gravando';
  const transcrevendo = ditado.estado === 'transcrevendo';
  useEffect(() => onGravando(gravando), [gravando, onGravando]);
  return (
    <button
      type="button"
      aria-label={gravando ? 'Parar de gravar' : transcrevendo ? 'Transcrevendo' : 'Ditar mensagem'}
      aria-pressed={gravando}
      disabled={transcrevendo || (disabled && !gravando)}
      onClick={() => {
        onAviso(null);
        if (gravando) ditado.parar();
        else void ditado.comecar();
      }}
      className={cn(
        ghostButton,
        'size-9 shrink-0 rounded-full disabled:opacity-60',
        gravando && 'text-danger hover:text-danger',
      )}
    >
      {gravando ? (
        <SquareIcon size={14} className="fill-current" aria-hidden />
      ) : transcrevendo ? (
        <LoaderCircleIcon
          size={18}
          className="animate-spin motion-reduce:animate-none"
          aria-hidden
        />
      ) : (
        <MicIcon size={18} aria-hidden />
      )}
    </button>
  );
}

/**
 * O que espera a resposta terminar, acima do campo. Cada item tem X: parar a
 * resposta não descarta a fila, e o que foi escrito não some sem a pessoa ver.
 */
function ComposerQueue({
  itens,
  onTirar,
  onMandar,
  pausado,
  parada,
  rodando,
}: {
  itens: ItemDaFila[];
  onTirar: (id: string) => void;
  onMandar: (id: string) => void;
  pausado: boolean;
  /** A última resposta falhou: nada sai sozinho; cada item espera "Enviar" ou "Descartar". */
  parada: boolean;
  rodando: boolean;
}) {
  if (itens.length === 0) return null;
  return (
    <section aria-label="Mensagens na fila" className="flex shrink-0 flex-col gap-1.5 px-4 pb-2">
      <p className="text-xs text-muted-foreground">
        {parada
          ? 'A resposta anterior falhou. Estas ficaram esperando você:'
          : pausado
            ? 'Vai depois que você responder o cartão acima:'
            : 'Vai depois desta resposta:'}
      </p>
      <ul className="flex flex-col gap-1.5">
        {itens.map((item) => (
          <li
            key={item.id}
            className={cn(field, 'flex items-center gap-2 rounded-xl py-1.5 pl-3 pr-1.5 text-sm')}
          >
            <span className="min-w-0 flex-1 truncate">{item.texto}</span>
            {parada ? (
              <>
                <button
                  type="button"
                  disabled={rodando}
                  aria-label={`Enviar: ${item.texto}`}
                  onClick={() => onMandar(item.id)}
                  className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-success hover:underline disabled:opacity-50"
                >
                  Enviar
                </button>
                <button
                  type="button"
                  aria-label={`Descartar: ${item.texto}`}
                  onClick={() => onTirar(item.id)}
                  className="shrink-0 rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Descartar
                </button>
              </>
            ) : (
              <button
                type="button"
                aria-label={`Tirar da fila: ${item.texto}`}
                onClick={() => onTirar(item.id)}
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <XIcon size={14} aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Composer() {
  const aui = useAui();
  const campo = useRef<HTMLTextAreaElement>(null);
  const texto = useAuiState((s) => s.composer.text);
  const temFoto = useAuiState((s) => s.composer.attachments.length > 0);
  const citacao = useAuiState((s) => s.composer.quote?.text);
  const rodando = useAuiState((s) => s.thread.isRunning);
  const recursos = useDisponibilidadeDoChat();
  // O runtime só chega à conversa da URL depois que a lista de conversas responde
  // (ver `ChatRuntimeProvider`), e a chegada zera o composer: o texto digitado e a
  // foto anexada antes disso sumiriam. Campo, câmera e microfone esperam.
  const aberta = useConversaAberta();
  const abrindo = useAuiState((s) => Boolean(aberta) && s.threadListItem?.remoteId !== aberta);
  // Com uma pausa na mesa, a resposta é o cartão: a mensagem nova descartaria a
  // pausa (o agente segue), e é fácil fazer isso sem querer.
  const pausado = Boolean(useLangGraphInterruptState()?.value);
  const cotaEsgotada = useCotaEsgotada();
  const markStopped = useMarkStopped();
  const [digitando, setDigitando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const podeEnviar = texto.trim() !== '' || temFoto;
  // "Parar" espera o servidor fechar o turno antes de a fila andar: a próxima esbarraria no 409.
  const [parando, setParando] = useState(false);
  const erroDoTurno = useTurnError();
  const respostaFalhou = useAuiState((s) => {
    const ultima = s.thread.messages.at(-1);
    return (
      ultima?.role === 'assistant' &&
      ultima.status?.type === 'incomplete' &&
      ultima.status.reason === 'error'
    );
  });
  const fila = useMessageQueue({
    conversa: aberta,
    livre: canDrainQueue({ rodando, pausado, abrindo, parando }),
    enviar: (pergunta) => aui.thread().append(pergunta),
    falhou: respostaFalhou || Boolean(erroDoTurno),
  });
  // A foto fica no campo: subir ao bucket é do envio, e a fila guarda só texto.
  const podeEnfileirar = texto.trim() !== '' && !temFoto;

  function enviar() {
    if (!podeEnviar || rodando || abrindo) return;
    // A citação entra no texto: o metadado em que o assistant-ui a guarda não
    // passa pela conversão para o LangChain (ver `./citacao`).
    if (citacao) {
      aui.composer().setText(withQuote(citacao, texto));
      aui.composer().setQuote(undefined);
    }
    aui.composer().send();
    // A #221 nasceu de foco perdido para o `<body>`. Sem esta linha, quem conversa
    // pelo teclado teria de reencontrar o campo antes de cada mensagem.
    campo.current?.focus();
  }

  const acoes =
    recursos?.photos || recursos?.dictation ? (
      <>
        {recursos.photos ? <BotaoDeFoto disabled={abrindo} /> : null}
        {recursos.dictation ? (
          <BotaoDeDitado disabled={abrindo} onAviso={setAviso} onGravando={setGravando} />
        ) : null}
      </>
    ) : undefined;

  function enfileirar() {
    if (!podeEnfileirar) return;
    fila.enfileirar(withQuote(citacao, texto));
    aui.composer().setText('');
    if (citacao) aui.composer().setQuote(undefined);
    campo.current?.focus();
  }

  return (
    <>
      {aviso ? (
        <p role="alert" className="shrink-0 px-5 pb-1 text-xs text-danger">
          {aviso}
        </p>
      ) : null}
      {gravando ? (
        // Prancha Al-M17: quem fala precisa saber que a voz não fica guardada.
        <p role="status" className="shrink-0 px-5 pb-1 text-xs text-muted-foreground">
          <span className="font-semibold text-danger">Ouvindo…</span> O áudio vira texto e é
          descartado.
        </p>
      ) : null}
      <ComposerQueue
        itens={fila.itens}
        onTirar={fila.tirar}
        onMandar={fila.mandar}
        pausado={pausado}
        parada={fila.parada}
        rodando={rodando || parando}
      />
      <CitacaoDoComposer />
      <MobileComposer
        ref={campo}
        value={texto}
        onValueChange={(valor) => aui.composer().setText(valor)}
        running={rodando}
        keyboardOpen={digitando}
        onFocus={() => setDigitando(true)}
        onBlur={() => setDigitando(false)}
        label="Mensagem para o Fatia"
        placeholder={
          // O texto da prancha IA-Estados; com uma pausa na mesa, o cartão acima já pede a resposta.
          abrindo
            ? 'Abrindo a conversa…'
            : cotaEsgotada
              ? AI_STATES_COPY.quotaPlaceholder
              : 'Responda ou peça outra coisa'
        }
        disabled={abrindo}
        sendLabel="Enviar mensagem"
        stopLabel="Parar resposta"
        actions={acoes}
        attachments={<AnexosDoComposer />}
        canSend={podeEnviar}
        onSend={enviar}
        onQueue={podeEnfileirar ? enfileirar : undefined}
        onStop={() => {
          // Marcada antes de cancelar: o runtime não diferencia "parou" de
          // "terminou" (react-langgraph nunca marca `incomplete/cancelled`).
          const ultima = aui.thread().getState().messages.at(-1);
          if (ultima?.role === 'assistant') markStopped(ultima.id);
          // Parar é no servidor (ADR 035): fechar a conexão não para mais o turno. A fila
          // espera o servidor responder (ele responde depois de o turno fechar).
          if (aberta) {
            setParando(true);
            void stopChatRun(aberta)
              .catch(() => undefined)
              .finally(() => setParando(false));
          }
          aui.thread().cancelRun();
        }}
        className="shrink-0 bg-transparent shadow-none"
      />
    </>
  );
}

export function ChatThread() {
  const rodando = useAuiState((s) => s.thread.isRunning);
  const liberado = useChatUnlocked();
  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <LiveJoin />
      <DrawerMessage />
      <BarraDeCitacao />
      <Conversation aria-busy={rodando} className="min-h-0">
        <ConversationContent>
          <AuiIf condition={(s) => s.thread.isEmpty && !s.thread.isLoading}>
            <Boas />
          </AuiIf>
          <ThreadPrimitive.Messages
            components={{ UserMessage: MensagemDaPessoa, AssistantMessage: MensagemDoAssistente }}
          />
          {/* No fim do fluxo, e dentro da rolagem: a decisão é sobre a mensagem
              logo acima, e é lá que a pessoa relê "200 g de frango". */}
          <TurnErrorNotice />
          <PlanoDoTurno />
          <PausaDoAgente />
          <MotivoDoVoto />
        </ConversationContent>
        <ConversationScrollButton label="Ir para a última mensagem" />
      </Conversation>
      <Anuncio />
      <AvisoDeCota />
      {liberado ? (
        <>
          <PilulasDeResposta />
          <Composer />
        </>
      ) : null}
      <ChatConsentSheet />
    </ThreadPrimitive.Root>
  );
}
