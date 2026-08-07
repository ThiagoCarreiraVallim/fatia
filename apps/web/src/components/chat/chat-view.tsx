'use client';

import { useRef } from 'react';
import { MessageCircle, RotateCcw } from 'lucide-react';
import { textoDeErroDoChat, type ChatStreamError, type ChatToolCall } from '@fatia/api-client';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Loader } from '@/components/ai-elements/loader';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { useChatStream, type ChatUiMessage } from './use-chat-stream';

/**
 * `ToolUIPart["type"]` é `tool-${string}` — o `ToolHeader` do registry corta o
 * primeiro segmento para exibir. Como mostramos o nome pelo `title`, o prefixo é
 * só o que o tipo exige.
 */
function tipoDaTool(tool: ChatToolCall): `tool-${string}` {
  return `tool-${tool.name}`;
}

function BlocoDeTool({ tool }: { tool: ChatToolCall }) {
  return (
    <Tool>
      <ToolHeader title={tool.name} type={tipoDaTool(tool)} state={tool.state} />
      <ToolContent>
        <ToolInput input={tool.input} />
        <ToolOutput output={tool.output} errorText={tool.errorText} />
      </ToolContent>
    </Tool>
  );
}

function AvisoDeErro({ error, onRetry }: { error: ChatStreamError; onRetry: () => void }) {
  return (
    // `role="alert"` e não a região viva da conversa: erro é interrupção, e
    // precisa chegar mesmo se a pessoa estiver com o foco no campo de texto.
    <div
      role="alert"
      className="mt-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-[13px] text-foreground"
    >
      <p>{textoDeErroDoChat(error)}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-destructive/20 px-3 py-1.5 text-xs font-bold text-foreground"
      >
        <RotateCcw size={12} />
        Tentar de novo
      </button>
    </div>
  );
}

function Balao({
  mensagem,
  aguardando,
  onRetry,
}: {
  mensagem: ChatUiMessage;
  aguardando: boolean;
  onRetry: () => void;
}) {
  return (
    <Message from={mensagem.role}>
      <MessageContent>
        {mensagem.tools.map((tool) => (
          <BlocoDeTool key={tool.id} tool={tool} />
        ))}
        {mensagem.text ? <MessageResponse>{mensagem.text}</MessageResponse> : null}
        {aguardando && !mensagem.text ? <Loader aria-label="Pensando" /> : null}
        {mensagem.error ? <AvisoDeErro error={mensagem.error} onRetry={onRetry} /> : null}
      </MessageContent>
    </Message>
  );
}

export function ChatView() {
  const { messages, status, announcement, send, retry, stop } = useChatStream();
  const campo = useRef<HTMLTextAreaElement>(null);
  const respondendo = status === 'submitted' || status === 'streaming';

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col">
      <header className="px-5 pt-4 pb-2">
        <h1 className="text-3xl font-extrabold text-foreground">Chat</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Peça para registrar refeição, consultar treino ou ver sua evolução.
        </p>
      </header>

      {/*
        `aria-live="off"` desliga o anúncio automático do `role="log"` que o
        `Conversation` traz. Com ele ligado, cada token do streaming vira um
        anúncio e a resposta fica impossível de acompanhar. Quem anuncia é a
        região abaixo, uma vez por resposta.
      */}
      <Conversation aria-live="off" aria-busy={respondendo} className="min-h-0">
        <ConversationContent className="gap-6 pb-2">
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<MessageCircle size={28} />}
              title="Nada por aqui ainda"
              description="Escreva abaixo — por exemplo: “registra 2 ovos e um café no café da manhã”."
            />
          ) : (
            messages.map((m, i) => (
              <Balao
                key={m.id}
                mensagem={m}
                aguardando={respondendo && i === messages.length - 1}
                onRetry={() => void retry()}
              />
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton aria-label="Ir para a última mensagem" />
      </Conversation>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/*
        O `PromptInputProvider` não é enfeite: sem ele o `PromptInput` fica no
        modo não controlado, que limpa o campo com `form.reset()`. O DOM esvazia,
        mas o valor que o React guarda continua sendo o antigo — e a **segunda**
        mensagem sai concatenada com a primeira ("oi" + "e agora?" = "oie
        agora?"). Com o provider o campo é controlado e o `clear()` é do React.
      */}
      <PromptInputProvider>
        <div className="px-4 pb-3">
          <PromptInput
            onSubmit={(mensagem) => {
              if (respondendo) {
                stop();
                return;
              }
              if (!mensagem.text.trim()) return;
              // O envio não é aguardado de propósito: `PromptInput` só limpa o
              // campo quando o `onSubmit` resolve, e esperar o stream inteiro
              // deixaria a pergunta na caixa durante toda a resposta.
              void send(mensagem.text);
              // A #221 nasceu de foco perdido para o `<body>`. Aqui é o botão de
              // enviar que fica com o foco depois do clique, e quem conversa pelo
              // teclado teria de reencontrar o campo antes de cada mensagem.
              campo.current?.focus();
            }}
          >
            <PromptInputBody>
              <PromptInputTextarea
                ref={campo}
                aria-label="Mensagem para o Fatia"
                placeholder="Escreva sua mensagem"
              />
              <PromptInputFooter>
                <PromptInputTools />
                <PromptInputSubmit
                  status={status}
                  aria-label={respondendo ? 'Parar resposta' : 'Enviar mensagem'}
                />
              </PromptInputFooter>
            </PromptInputBody>
          </PromptInput>
        </div>
      </PromptInputProvider>
    </div>
  );
}
