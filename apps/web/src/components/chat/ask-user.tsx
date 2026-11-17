'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Globe, HelpCircle, Layers, PencilLine, PlayCircle } from 'lucide-react';
import type {
  ChatAskField,
  ChatConfirmAction,
  ChatInterruptValue,
  ChatQuestionAction,
  ChatResumeValue,
  ChatWebConsentAction,
} from '@fatia/api-client';
import {
  AI_CONSENT_TEXTS,
  aiConsentBody,
  askFieldsOf,
  previewChatAction,
  questionAnswer,
} from '@fatia/api-client';
import { useAceitar, useAceitesDaIa } from './catalogo';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { field, floating, ghostButton, inkButton } from '../elements/surfaces';

/**
 * A pausa do agente, nas três formas que ela tem (ADR 023).
 *
 * `kind` vem do servidor para o cliente não ter de adivinhar pelo texto: aprovar
 * uma escrita, responder uma pergunta e autorizar mais trabalho são decisões
 * diferentes e merecem telas diferentes. Uma pausa pode trazer as duas primeiras
 * juntas ("que horas?" + "registrar peso"), e aí a resposta vai numa volta só.
 *
 * **Um cartão no fim da conversa, e não um popup.** A decisão é sobre o que
 * acabou de ser dito, e o contexto que a torna decidível — "200 g de frango" —
 * está na mensagem acima. Sem `role="dialog"`: não há nada para fechar, e trap de
 * foco prenderia quem quer reler a conversa antes de decidir.
 */

type Props = {
  pausa: ChatInterruptValue;
  ocupado: boolean;
  onResponder: (resposta: ChatResumeValue) => void;
};

export function AskUser({ pausa, ocupado, onResponder }: Props) {
  if (pausa.kind === 'continue') {
    return <Continuar pausa={pausa} ocupado={ocupado} onResponder={onResponder} />;
  }
  return <Acoes pausa={pausa} ocupado={ocupado} onResponder={onResponder} />;
}

/** O cabeçalho dos cartões da pausa: ícone, a ação pequena em cima e o título. */
function Cabecalho({
  icone,
  acima,
  titulo,
  perigo = false,
}: {
  icone: ReactNode;
  acima: string;
  titulo: string;
  perigo?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-xl',
          perigo ? 'bg-danger/15 text-danger' : 'bg-primary/15 text-success',
        )}
      >
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-muted-foreground">{acima}</span>
        <span className="block text-[15px] font-bold leading-snug text-foreground">{titulo}</span>
      </span>
    </div>
  );
}

/**
 * Uma escrita à espera do sim (prancha IA-Cartoes, "Confirmação"): o que vai gravar, Gravar e
 * Ajustar. Ajustar recusa — nada é gravado — e a pessoa diz no campo o que mudar. Se a IA
 * montou algo que a tool recusaria, o cartão fica vermelho e não deixa gravar.
 */
function Escrita({
  acao,
  decisao,
  ocupado,
  onDecidir,
  focar,
  emLote,
}: {
  acao: ChatConfirmAction;
  decisao: boolean | undefined;
  ocupado: boolean;
  onDecidir: (aprovada: boolean) => void;
  focar: boolean;
  emLote: boolean;
}) {
  const confirmar = useRef<HTMLButtonElement>(null);
  const {
    data: previa,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['chat', 'preview', acao.toolCallId],
    queryFn: () => previewChatAction(acao.tool, acao.arguments),
    staleTime: Infinity,
    retry: 1,
  });
  // Gravar antes de o resumo chegar seria aprovar sem ler; e o argumento que a
  // própria tool recusaria só levaria a um erro depois.
  const invalida = previa?.valida === false;
  const travado = isPending || invalida;
  useEffect(() => {
    // O foco vai para "Gravar" quando o resumo aparece: quem conversa pelo
    // teclado estava no campo de texto, e sem isto tabularia a conversa inteira.
    if (focar && !travado) confirmar.current?.focus();
  }, [focar, travado]);

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border p-3.5 text-sm',
        emLote ? 'border-transparent bg-foreground/[0.04]' : field,
        !emLote && (invalida ? 'border-danger/50' : 'border-primary/60'),
      )}
    >
      <Cabecalho
        icone={invalida ? <AlertCircle size={18} /> : <PencilLine size={18} />}
        acima={acao.title}
        titulo={invalida ? 'Não dá para gravar assim' : 'Confere antes de gravar'}
        perigo={invalida}
      />
      {isPending ? (
        <p className="text-xs text-muted-foreground">Preparando o resumo…</p>
      ) : isError ? (
        <p className="text-xs text-muted-foreground">
          Não consegui mostrar os detalhes. Se tiver dúvida, toque em Ajustar e peça de novo.
        </p>
      ) : invalida ? (
        <p role="alert" className="text-sm text-foreground/75">
          {previa.problema}
        </p>
      ) : previa.linhas.length > 0 ? (
        <dl className="divide-y divide-border rounded-xl bg-foreground/[0.04] px-3">
          {previa.linhas.map((linha, indice) => (
            <div key={`${linha.rotulo}-${indice}`} className="flex gap-3 py-2">
              <dt className="shrink-0 text-foreground/55">{linha.rotulo}</dt>
              <dd className="flex-1 text-right font-semibold text-foreground">{linha.valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="flex gap-2">
        {invalida ? null : (
          <button
            ref={confirmar}
            type="button"
            aria-pressed={emLote ? decisao === true : undefined}
            disabled={ocupado || travado}
            onClick={() => onDecidir(true)}
            className={cn(
              inkButton,
              'flex-1 rounded-full px-4 py-2 text-sm font-bold',
              decisao === false && 'opacity-40',
              (ocupado || travado) && 'pointer-events-none opacity-50',
            )}
          >
            Gravar
          </button>
        )}
        {/* Nunca desabilitado por texto digitado: recusar é a saída, e uma saída
            que depende de preencher algo não é saída. */}
        <button
          type="button"
          aria-pressed={emLote ? decisao === false : undefined}
          aria-description="Não grava. Diga no campo o que mudar."
          disabled={ocupado}
          onClick={() => onDecidir(false)}
          className={cn(
            ghostButton,
            'rounded-full px-4 py-2 text-sm',
            invalida && 'flex-1',
            decisao === true && 'opacity-40',
            ocupado && 'pointer-events-none opacity-50',
          )}
        >
          Ajustar
        </button>
      </div>
    </div>
  );
}

/**
 * O aceite da busca na web, no meio da conversa e com a pergunta à vista: o que sai é só
 * esse texto. Concordar grava o aceite (se ainda não havia) e libera a busca desta vez.
 */
function AceiteDaBusca({
  acao,
  ocupado,
  onDecidir,
}: {
  acao: ChatWebConsentAction;
  ocupado: boolean;
  onDecidir: (aprovada: boolean) => void;
}) {
  const textos = AI_CONSENT_TEXTS.webSearch;
  const { data: aceites } = useAceitesDaIa();
  const aceitar = useAceitar();
  const [falhou, setFalhou] = useState(false);
  return (
    <section
      role="group"
      aria-label={textos.title}
      className={cn(field, 'flex w-full flex-col gap-3 rounded-2xl border border-primary/60 p-3.5')}
    >
      <Cabecalho icone={<Globe size={18} />} acima="Buscar na web" titulo={textos.title} />
      {acao.query ? (
        <p className="rounded-xl bg-foreground/[0.04] px-3 py-2 text-sm text-foreground">
          Vou buscar: “{acao.query}”
        </p>
      ) : null}
      <p className="text-xs leading-relaxed text-foreground/70">
        {aceites?.processor
          ? aiConsentBody('web_search', aceites.processor)
          : 'Carregando o aviso…'}
      </p>
      {falhou ? (
        <p role="alert" className="text-xs text-danger">
          Não consegui gravar o aceite. Tente de novo.
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={ocupado || aceitar.isPending || !aceites?.processor}
          onClick={async () => {
            setFalhou(false);
            if (!aceites?.webSearch.accepted) {
              try {
                await aceitar.mutateAsync('web_search');
              } catch {
                setFalhou(true);
                return;
              }
            }
            onDecidir(true);
          }}
          className={cn(inkButton, 'flex-1 rounded-full px-4 py-2 text-sm font-bold')}
        >
          {textos.accept}
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => onDecidir(false)}
          className={cn(ghostButton, 'flex-1 rounded-full px-4 py-2 text-sm')}
        >
          {textos.decline}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">{textos.footnote}</p>
    </section>
  );
}

function CampoDaPergunta({
  campo,
  valor,
  onMudar,
}: {
  campo: ChatAskField;
  valor: string;
  onMudar: (valor: string) => void;
}) {
  const id = `pergunta-${campo.name}`;
  const rotulo = (
    <label htmlFor={id} className="text-xs text-foreground/70">
      {campo.label}
      {campo.required ? ' *' : ''}
    </label>
  );

  if (campo.type === 'select' || campo.type === 'boolean') {
    const opcoes = campo.type === 'boolean' ? ['Sim', 'Não'] : (campo.options ?? []);
    return (
      <fieldset className="space-y-1">
        <legend className="text-xs text-foreground/70">
          {campo.label}
          {campo.required ? ' *' : ''}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {opcoes.map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-pressed={valor === opcao}
              onClick={() => onMudar(opcao)}
              className={cn(
                valor === opcao ? inkButton : ghostButton,
                'rounded-full border border-border px-3 py-1 text-xs',
              )}
            >
              {opcao}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <div className="space-y-1">
      {rotulo}
      <Input
        id={id}
        type={campo.type === 'number' ? 'number' : campo.type === 'date' ? 'date' : 'text'}
        inputMode={campo.type === 'number' ? 'decimal' : undefined}
        value={valor}
        required={campo.required}
        onChange={(evento) => onMudar(evento.target.value)}
        className="h-9 text-sm"
      />
    </div>
  );
}

/** A resposta de um formulário, no texto que o modelo lê: "campo: valor". */
function Pergunta({
  acao,
  valores,
  onMudar,
}: {
  acao: ChatQuestionAction;
  valores: Record<string, string>;
  onMudar: (nome: string, valor: string) => void;
}) {
  const campos = askFieldsOf(acao);
  return (
    <div className={cn(field, 'space-y-3 rounded-lg p-3')}>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <HelpCircle size={15} className="shrink-0 text-primary" aria-hidden />
        {acao.prompt}
      </p>
      {campos.map((campo) => (
        <CampoDaPergunta
          key={campo.name}
          campo={campo}
          valor={valores[campo.name] ?? ''}
          onMudar={(valor) => onMudar(campo.name, valor)}
        />
      ))}
    </div>
  );
}

/** Pergunta sem campos vira resposta livre, com a própria pergunta de rótulo. */
function Acoes({ pausa, ocupado, onResponder }: Props) {
  const escritas = useMemo(
    () => pausa.actions.filter((a): a is ChatConfirmAction => a.kind === 'confirm'),
    [pausa.actions],
  );
  const perguntas = useMemo(
    () => pausa.actions.filter((a): a is ChatQuestionAction => a.kind === 'question'),
    [pausa.actions],
  );
  const buscas = useMemo(
    () => pausa.actions.filter((a): a is ChatWebConsentAction => a.kind === 'web_consent'),
    [pausa.actions],
  );
  const [decisoes, setDecisoes] = useState<Record<string, boolean>>({});
  const [respostas, setRespostas] = useState<Record<string, Record<string, string>>>({});

  const faltaDecidir = [...escritas, ...buscas].some(
    (acao) => decisoes[acao.toolCallId] === undefined,
  );
  const faltaResponder = perguntas.some((acao) =>
    askFieldsOf(acao).some(
      (campo) =>
        (campo.required || campo.name === '__livre') &&
        !(respostas[acao.toolCallId]?.[campo.name] ?? '').trim(),
    ),
  );
  // Uma escrita sozinha responde no clique: um segundo botão "enviar" para uma
  // decisão só seria atrito. Com mais de uma coisa na mesa, a pessoa decide cada
  // uma e envia no fim — aprovar uma e recusar outra é o comportamento certo.
  const soUmaEscrita = escritas.length + buscas.length === 1 && perguntas.length === 0;

  function enviar(extra: Record<string, boolean> = {}) {
    const aprovacoes = { ...decisoes, ...extra };
    onResponder({
      approvals: aprovacoes,
      answers: Object.fromEntries(
        perguntas.map((acao) => [
          acao.toolCallId,
          questionAnswer(askFieldsOf(acao), respostas[acao.toolCallId] ?? {}),
        ]),
      ),
    });
  }

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (!faltaDecidir && !faltaResponder) enviar();
  }

  const emLote = escritas.length > 1;
  const titulo = emLote
    ? `${escritas.length} ações aguardando confirmação`
    : escritas.length === 1
      ? 'Ação aguardando confirmação'
      : 'Pergunta do assistente';
  const decidir = (acao: { toolCallId: string }) => (aprovada: boolean) => {
    if (soUmaEscrita) {
      enviar({ [acao.toolCallId]: aprovada });
      return;
    }
    setDecisoes((atual) => ({ ...atual, [acao.toolCallId]: aprovada }));
  };

  // A busca sozinha é o cartão do aceite, sem moldura de formulário em volta.
  if (buscas.length === 1 && escritas.length === 0 && perguntas.length === 0) {
    return <AceiteDaBusca acao={buscas[0]!} ocupado={ocupado} onDecidir={decidir(buscas[0]!)} />;
  }

  return (
    <form
      role="group"
      aria-label={titulo}
      onSubmit={aoEnviar}
      className={cn(
        'w-full space-y-3',
        (emLote || perguntas.length > 0 || buscas.length > 0) &&
          cn(floating, 'rounded-2xl border border-primary/60 p-3.5'),
      )}
    >
      {emLote ? (
        <Cabecalho
          icone={<Layers size={18} />}
          acima="Lote"
          titulo={`${escritas.length} ações para decidir`}
        />
      ) : null}

      {perguntas.map((acao) => (
        <Pergunta
          key={acao.toolCallId}
          acao={acao}
          valores={respostas[acao.toolCallId] ?? {}}
          onMudar={(nome, valor) =>
            setRespostas((atual) => ({
              ...atual,
              [acao.toolCallId]: { ...atual[acao.toolCallId], [nome]: valor },
            }))
          }
        />
      ))}

      {buscas.map((acao) => (
        <AceiteDaBusca
          key={acao.toolCallId}
          acao={acao}
          ocupado={ocupado}
          onDecidir={decidir(acao)}
        />
      ))}

      {escritas.map((acao, indice) => (
        <Escrita
          key={acao.toolCallId}
          acao={acao}
          decisao={decisoes[acao.toolCallId]}
          ocupado={ocupado}
          emLote={emLote}
          focar={indice === 0 && perguntas.length === 0}
          onDecidir={decidir(acao)}
        />
      ))}

      {soUmaEscrita ? null : (
        <button
          type="submit"
          disabled={ocupado || faltaDecidir || faltaResponder}
          className={cn(
            inkButton,
            'rounded-full px-4 py-2 text-sm font-bold',
            (ocupado || faltaDecidir || faltaResponder) && 'pointer-events-none opacity-50',
          )}
        >
          {ocupado ? 'Enviando…' : emLote ? `Enviar ${escritas.length} decisões` : 'Enviar'}
        </button>
      )}
    </form>
  );
}

/**
 * O orçamento acabou, ou o turno já consultou muita coisa ("Já consultei N coisas.
 * Continuo?"). O resumo é o que permite decidir sem adivinhar.
 */
function Continuar({ pausa, ocupado, onResponder }: Props) {
  return (
    <section
      role="group"
      aria-label={pausa.prompt || 'O assistente pede para continuar'}
      className={cn(floating, 'w-full space-y-3 rounded-2xl p-4')}
    >
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <PlayCircle size={15} className="shrink-0 text-primary" aria-hidden />
        {pausa.prompt}
      </p>
      {pausa.summary ? <p className="text-xs text-muted-foreground">{pausa.summary}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={ocupado}
          onClick={() => onResponder(true)}
          className={cn(inkButton, 'rounded-full px-4 py-2 text-sm font-bold')}
        >
          Continuar
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => onResponder(false)}
          className={cn(ghostButton, 'rounded-full px-4 py-2 text-sm')}
        >
          Parar aqui
        </button>
      </div>
    </section>
  );
}
