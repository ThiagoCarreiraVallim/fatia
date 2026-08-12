'use client';

import { useRef, useState } from 'react';
import { Streamdown } from 'streamdown';
import { textoDeErroDoChat, type ChatToolCall } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { field } from '@/components/elements/surfaces';
import {
  EmptyState,
  EmptyStateGreeting,
  EmptyStateSuggestion,
  EmptyStateSuggestions,
} from '@/components/elements/empty-state';
import { ErrorState } from '@/components/elements/error-state';
import { ThinkingIndicator } from '@/components/elements/thinking-indicator';
import { ToolCall, type ToolCallState } from '@/components/elements/tool-call';
import { MobileComposer } from '@/components/elements/mobile-composer';
import { Conversation, ConversationContent, ConversationScrollButton } from './conversation';
import { useChatStream, type ChatUiMessage, type ChatStreamProposalEvent } from './use-chat-stream';
import { ConfirmationModal } from './confirmation-modal';

/**
 * A tela do chat, sobre os elements do assistant-ui.
 *
 * O que **não** veio do pacote, e por quê: a rolagem (`./conversation`, porque o
 * `elements-scroll-anchor` de lá é uma vitrine com timer) e o corpo da resposta
 * do assistente, que continua no `streamdown`. A família de elements renderiza
 * texto puro, palavra a palavra por contador; o agente responde em markdown, e
 * trocar isso apagaria negrito, lista e tabela da resposta — perda visível para
 * quem lê "seu almoço teve **42 g** de proteína".
 */

const SUGESTOES = [
  'O que eu comi hoje?',
  'Como está minha proteína esta semana?',
  'Qual foi meu último treino de peito?',
] as const;

/** O element pede texto; input e output do MCP chegam como JSON qualquer. */
function comoTexto(valor: unknown): string {
  if (valor === undefined || valor === null) return '—';
  if (typeof valor === 'string') return valor;
  try {
    return JSON.stringify(valor, null, 2);
  } catch {
    // Referência circular: melhor a etiqueta do que derrubar a conversa inteira.
    return String(valor);
  }
}

const ESTADO_DA_TOOL: Record<ChatToolCall['state'], ToolCallState> = {
  'input-available': 'running',
  'output-available': 'done',
  'output-error': 'error',
};

function BlocoDeTool({ tool }: { tool: ChatToolCall }) {
  const [aberto, setAberto] = useState(false);
  const estado = ESTADO_DA_TOOL[tool.state];

  return (
    <ToolCall
      state={estado}
      // O nome da tool vai na etiqueta monoespaçada, e não no rótulo: é o dado
      // que torna a ação auditável, e é por ele que alguém procura na tela.
      query={tool.name}
      activeLabel="Executando"
      label="Concluída"
      errorLabel="Falhou"
      request={comoTexto(tool.input)}
      result={estado === 'error' ? (tool.errorText ?? '—') : comoTexto(tool.output)}
      open={aberto}
      onOpenChange={setAberto}
      className="max-w-none"
    />
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
  if (mensagem.role === 'user') {
    return (
      // `field`, e não `paper`: é a receita que os próprios elements usam para
      // mensagem de quem pergunta. `paper` é `bg-background` com `dark:bg-popover`,
      // e nesta paleta os dois ficam a 2,5% de luminosidade um do outro — o balão
      // sumiria no fundo da página.
      <p
        className={cn(
          field,
          'max-w-[85%] self-end whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm',
        )}
      >
        {mensagem.text}
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col items-start gap-3">
      {mensagem.tools.map((tool) => (
        <BlocoDeTool key={tool.id} tool={tool} />
      ))}
      {mensagem.text ? (
        <Streamdown className="w-full text-sm leading-relaxed">{mensagem.text}</Streamdown>
      ) : null}
      {aguardando && !mensagem.text ? (
        // `aria-label` além do rótulo visível: é o nome estável pelo qual o teste
        // — e o leitor de tela — encontram o único retorno que existe entre
        // apertar enviar e o primeiro token.
        <ThinkingIndicator aria-label="Pensando" label="Pensando" />
      ) : null}
      {mensagem.error ? (
        <ErrorState
          className="max-w-none"
          title="A resposta falhou"
          detail={textoDeErroDoChat(mensagem.error)}
          retryLabel="Tentar de novo"
          onRetry={onRetry}
        />
      ) : null}
    </div>
  );
}

export function ChatView() {
  const { messages, status, respondendoId, announcement, proposta, send, retry, stop } = useChatStream();
  const campo = useRef<HTMLTextAreaElement>(null);
  const [texto, setTexto] = useState('');
  const [digitando, setDigitando] = useState(false);
  const respondendo = status === 'submitted' || status === 'streaming';

  /** Estado para controlar o modal de confirmação. */
  const [aguardandoConfirmacao, setAguardandoConfirmacao] = useState(false);

  // Quando uma nova proposta chega via stream, entra em modo espera.
  useEffect(() => {
    if (proposta) setAguardandoConfirmacao(true);
  }, [proposta?.dados?.nomeTool]);

  /** Callbacks para o modal: limpar estados quando aprovado/rejeitado. */
  const onConclusao = useCallback(
    () => {
      setAguardandoConfirmacao(false);
      // O modal é desmontado via state, e a proposta é limpa no useEffect
      // que observa `aguardandoConfirmacao`.
    },
    [],
  );

  function enviar(mensagem: string) {
    const limpo = mensagem.trim();
    if (!limpo) return;
    setTexto('');
    // O envio não é aguardado de propósito: esperar o stream inteiro deixaria a
    // pergunta na caixa durante toda a resposta.
    void send(limpo);
    // A #221 nasceu de foco perdido para o `<body>`. Sem esta linha, quem
    // conversa pelo teclado teria de reencontrar o campo antes de cada mensagem.
    campo.current?.focus();
  }

  return (
    <div
      /*
        `10rem` = `pt-16` (4rem) + `pb-24` (6rem), o respiro que o layout de
        `(app)` reserva para a barra do topo e a de baixo. Subtrair só a de baixo
        (5rem, como esta linha fazia) faz a caixa terminar 4rem DENTRO da
        `bottom-nav`, que é `fixed` com `z-50`: o campo de mensagem fica visível
        e intocável — não dá para focar, digitar nem enviar.
        O padding do `<main>` não segura isto, porque altura explícita no filho
        transborda o padding do pai em vez de ser contida por ele.
        `chat-view-cabe-na-tela.test.ts` amarra este número ao do layout.
      */
      className="flex h-[calc(100dvh-10rem)] flex-col"
    >
      <header className="px-5 pb-2 pt-4">
        <h1 className="text-3xl font-extrabold text-foreground">Chat</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Peça para consultar sua refeição, seu treino ou sua evolução.
        </p>
      </header>

      <Conversation aria-busy={respondendo} className="min-h-0">
        <ConversationContent>
          {messages.length === 0 ? (
            <EmptyState className="my-auto max-w-none self-center">
              <EmptyStateGreeting>Por onde começamos?</EmptyStateGreeting>
              <EmptyStateSuggestions>
                {SUGESTOES.map((sugestao, indice) => (
                  <EmptyStateSuggestion
                    key={sugestao}
                    index={indice}
                    // A borda é acréscimo nosso: o `paper` do element conta com
                    // um contraste entre `background` e `popover` que esta
                    // paleta não tem, e sem ela a pílula não se lê como algo em
                    // que dá para tocar.
                    className="border border-border"
                    onClick={() => enviar(sugestao)}
                  >
                    {sugestao}
                  </EmptyStateSuggestion>
                ))}
              </EmptyStateSuggestions>
            </EmptyState>
          ) : (
            messages.map((m) => (
              <Balao
                key={m.id}
                mensagem={m}
                // Pelo id, e não pela posição: refazer um turno do meio deixa o
                // "pensando" no balão que está sendo reescrito, não no último.
                aguardando={m.id === respondendoId}
                onRetry={() => void retry(m.id)}
              />
            ))
          )}

          {aguardandoConfirmacao && proposta ? (
            <ConfirmationModal
              nomeTool={proposta.dados.nomeTool}
              argumentos={proposta.dados.argumentos}
              motivo={proposta.dados.motivo ?? `Confirmar chamada de ${proposta.dados.nomeTool}?`}
              onConclusao={onConclusao}
            />
          ) : null}
        </ConversationContent>
        <ConversationScrollButton label="Ir para a última mensagem" />
      </Conversation>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <MobileComposer
        ref={campo}
        value={texto}
        onValueChange={setTexto}
        running={respondendo}
        // O que o element chama de "teclado aberto" é, num celular, o campo com
        // foco — e é aí que a dica do Enter tem serventia e o respiro de baixo
        // sobra.
        keyboardOpen={digitando}
        onFocus={() => setDigitando(true)}
        onBlur={() => setDigitando(false)}
        label="Mensagem para o Fatia"
        placeholder="Escreva sua mensagem"
        sendLabel="Enviar mensagem"
        stopLabel="Parar resposta"
        hint="enter envia"
        onSend={() => enviar(texto)}
        onStop={stop}
        className="shrink-0 bg-transparent shadow-none"
      />
    </div>
  );
}
