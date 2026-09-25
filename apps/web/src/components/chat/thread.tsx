'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CameraIcon,
  CheckIcon,
  CopyIcon,
  LoaderCircleIcon,
  MicIcon,
  SquareIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from 'lucide-react';
import {
  ActionBarPrimitive,
  AuiIf,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
} from '@assistant-ui/react';
import { useLangGraphInterruptState } from '@assistant-ui/react-langgraph';
import { erroDoChat, textoDeErroDoChat } from '@fatia/api-client';
import { cn } from '@/lib/utils';
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
import { Conversation, ConversationContent, ConversationScrollButton } from './conversation';
import { ChamadaDeTool, TextoDoAssistente } from './partes';
import { PausaDoAgente } from './pausa';
import { MotivoDoVoto } from './motivo-do-voto';
import { PlanoDoTurno } from './plano';
import { AvisoDeCota } from './cota';
import { AnexosDaMensagem, AnexosDoComposer } from './anexos';
import { useDisponibilidadeDoChat } from './chat-runtime-provider';
import { useDitado } from './use-ditado';

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
  return (
    <MessagePrimitive.Root className="flex w-full flex-col items-end gap-2">
      <AnexosDaMensagem />
      {/* `field`, e não `paper`: nesta paleta `paper` fica a 2,5% de
          luminosidade do fundo, e o balão sumiria. */}
      <div className={cn(field, 'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm')}>
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

/** O erro de uma resposta, no texto do código — nunca a prosa do servidor. */
function ErroDaResposta() {
  const status = useAuiState((s) => s.message.status);
  const ultimaPergunta = useAuiState((s) => {
    const pessoa = [...s.thread.messages].reverse().find((m) => m.role === 'user');
    const parte = pessoa?.content.find((p) => p.type === 'text');
    return parte && parte.type === 'text' ? parte.text : '';
  });
  const aui = useAui();
  if (status?.type !== 'incomplete' || status.reason !== 'error') return null;
  return (
    <ErrorState
      className="max-w-none"
      title="A resposta falhou"
      detail={textoDeErroDoChat(erroDoChat(status.error))}
      retryLabel="Tentar de novo"
      // Reenvia a pergunta como mensagem nova: o estado da conversa está no
      // agente, e refazer "o turno do meio" exigiria bifurcar o checkpoint.
      onRetry={() => {
        if (ultimaPergunta) aui.thread().append(ultimaPergunta);
      }}
    />
  );
}

/** O "pensando", só enquanto a resposta ainda não tem texto nenhum. */
function Pensando() {
  const rodando = useAuiState((s) => s.message.status?.type === 'running');
  const temTexto = useAuiState((s) =>
    s.message.parts.some((parte) => parte.type === 'text' && parte.text.trim() !== ''),
  );
  if (!rodando || temTexto) return null;
  // `aria-label` além do rótulo visível: é o nome estável pelo qual o leitor de
  // tela encontra o único retorno entre apertar enviar e o primeiro token.
  return <ThinkingIndicator aria-label="Pensando" label="Pensando" />;
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
        className={cn(ghostButton, 'rounded-md p-1.5 data-[submitted]:text-emerald-500')}
      >
        <ThumbsUpIcon size={14} aria-hidden />
      </ActionBarPrimitive.FeedbackPositive>
      <ActionBarPrimitive.FeedbackNegative
        aria-label="Resposta ruim"
        className={cn(ghostButton, 'rounded-md p-1.5 data-[submitted]:text-rose-500')}
      >
        <ThumbsDownIcon size={14} aria-hidden />
      </ActionBarPrimitive.FeedbackNegative>
    </ActionBarPrimitive.Root>
  );
}

function MensagemDoAssistente() {
  return (
    <MessagePrimitive.Root className="flex w-full flex-col items-start gap-3">
      <MessagePrimitive.Parts
        components={{ Text: TextoDoAssistente, tools: { Fallback: ChamadaDeTool } }}
      />
      <Pensando />
      <ErroDaResposta />
      <BarraDeAcoes />
    </MessagePrimitive.Root>
  );
}

function Boas() {
  const aui = useAui();
  return (
    <EmptyState className="my-auto max-w-none self-center">
      <EmptyStateGreeting>Por onde começamos?</EmptyStateGreeting>
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

function BotaoDeFoto() {
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
        onClick={() => entrada.current?.click()}
        className={cn(ghostButton, 'size-9 shrink-0 rounded-full')}
      >
        <CameraIcon size={18} aria-hidden />
      </button>
    </>
  );
}

function BotaoDeDitado({ onAviso }: { onAviso: (aviso: string | null) => void }) {
  const aui = useAui();
  const ditado = useDitado(
    (texto) => {
      const atual = aui.composer().getState().text;
      aui.composer().setText(atual.trim() ? `${atual.trimEnd()} ${texto}` : texto);
      onAviso(null);
    },
    (mensagem) => onAviso(mensagem),
  );
  const gravando = ditado.estado === 'gravando';
  const transcrevendo = ditado.estado === 'transcrevendo';
  return (
    <button
      type="button"
      aria-label={gravando ? 'Parar de gravar' : transcrevendo ? 'Transcrevendo' : 'Ditar mensagem'}
      aria-pressed={gravando}
      disabled={transcrevendo}
      onClick={() => {
        onAviso(null);
        if (gravando) ditado.parar();
        else void ditado.comecar();
      }}
      className={cn(
        ghostButton,
        'size-9 shrink-0 rounded-full disabled:opacity-60',
        gravando && 'text-rose-500 hover:text-rose-500',
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

function Composer() {
  const aui = useAui();
  const campo = useRef<HTMLTextAreaElement>(null);
  const texto = useAuiState((s) => s.composer.text);
  const temFoto = useAuiState((s) => s.composer.attachments.length > 0);
  const rodando = useAuiState((s) => s.thread.isRunning);
  const recursos = useDisponibilidadeDoChat();
  // Com uma pausa na mesa, a resposta é o cartão: a mensagem nova descartaria a
  // pausa (o agente segue), e é fácil fazer isso sem querer.
  const pausado = Boolean(useLangGraphInterruptState()?.value);
  const [digitando, setDigitando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const podeEnviar = texto.trim() !== '' || temFoto;

  function enviar() {
    if (!podeEnviar || rodando) return;
    aui.composer().send();
    // A #221 nasceu de foco perdido para o `<body>`. Sem esta linha, quem conversa
    // pelo teclado teria de reencontrar o campo antes de cada mensagem.
    campo.current?.focus();
  }

  const acoes =
    recursos?.photos || recursos?.dictation ? (
      <>
        {recursos.photos ? <BotaoDeFoto /> : null}
        {recursos.dictation ? <BotaoDeDitado onAviso={setAviso} /> : null}
      </>
    ) : undefined;

  return (
    <>
      {aviso ? (
        <p role="alert" className="shrink-0 px-5 pb-1 text-xs text-rose-500">
          {aviso}
        </p>
      ) : null}
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
          pausado ? 'Responda no cartão acima, ou escreva outra coisa' : 'Escreva sua mensagem'
        }
        sendLabel="Enviar mensagem"
        stopLabel="Parar resposta"
        hint="enter envia"
        actions={acoes}
        attachments={<AnexosDoComposer />}
        canSend={podeEnviar}
        onSend={enviar}
        onStop={() => aui.thread().cancelRun()}
        className="shrink-0 bg-transparent shadow-none"
      />
    </>
  );
}

export function ChatThread() {
  const rodando = useAuiState((s) => s.thread.isRunning);
  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
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
          <PlanoDoTurno />
          <PausaDoAgente />
          <MotivoDoVoto />
        </ConversationContent>
        <ConversationScrollButton label="Ir para a última mensagem" />
      </Conversation>
      <Anuncio />
      <AvisoDeCota />
      <Composer />
    </ThreadPrimitive.Root>
  );
}
