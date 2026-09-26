'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, HelpCircle, PlayCircle } from 'lucide-react';
import type {
  ChatAskField,
  ChatConfirmAction,
  ChatInterruptValue,
  ChatQuestionAction,
  ChatResumeValue,
} from '@fatia/api-client';
import { previewChatAction } from '@fatia/api-client';
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

function Escrita({
  acao,
  decisao,
  ocupado,
  onDecidir,
  focar,
}: {
  acao: ChatConfirmAction;
  decisao: boolean | undefined;
  ocupado: boolean;
  onDecidir: (aprovada: boolean) => void;
  focar: boolean;
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
  // Confirmar antes de o resumo chegar seria aprovar sem ler; e o argumento que a
  // própria tool recusaria só levaria a um erro depois.
  const travado = isPending || previa?.valida === false;
  useEffect(() => {
    // O foco vai para "Confirmar" quando o resumo aparece: quem conversa pelo
    // teclado estava no campo de texto, e sem isto tabularia a conversa inteira.
    if (focar && !travado) confirmar.current?.focus();
  }, [focar, travado]);

  return (
    <div className={cn(field, 'rounded-lg p-3 text-sm')}>
      <p className="font-semibold text-foreground">{acao.title}</p>
      {isPending ? (
        <p className="mt-1 text-xs text-muted-foreground">Preparando o resumo…</p>
      ) : isError ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Não consegui mostrar os detalhes. Se tiver dúvida, recuse e peça de novo.
        </p>
      ) : (
        <>
          {previa.linhas.length > 0 ? (
            <dl className="mt-2 space-y-1">
              {previa.linhas.map((linha, indice) => (
                <div key={`${linha.rotulo}-${indice}`} className="flex gap-2">
                  <dt className="shrink-0 text-foreground/50">{linha.rotulo}</dt>
                  <dd className="text-foreground/85">{linha.valor}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {previa.valida === false ? (
            <p role="alert" className="mt-2 text-xs text-rose-500">
              {previa.problema}
            </p>
          ) : null}
        </>
      )}
      <div className="mt-3 flex gap-2">
        <button
          ref={confirmar}
          type="button"
          aria-pressed={decisao === true}
          disabled={ocupado || travado}
          onClick={() => onDecidir(true)}
          className={cn(
            inkButton,
            'rounded-full px-3 py-1.5 text-xs font-bold',
            decisao === false && 'opacity-40',
            (ocupado || travado) && 'pointer-events-none opacity-50',
          )}
        >
          Confirmar
        </button>
        {/* Nunca desabilitado por texto digitado: recusar é a saída, e uma saída
            que depende de preencher algo não é saída. */}
        <button
          type="button"
          aria-pressed={decisao === false}
          disabled={ocupado}
          onClick={() => onDecidir(false)}
          className={cn(
            ghostButton,
            'rounded-full px-3 py-1.5 text-xs',
            decisao === true && 'opacity-40',
            ocupado && 'pointer-events-none opacity-50',
          )}
        >
          Recusar
        </button>
      </div>
    </div>
  );
}

const TIPOS: ChatAskField['type'][] = ['text', 'number', 'date', 'select', 'boolean'];

/**
 * Os campos como o formulário precisa deles.
 *
 * ⚠️ Quem escreve `fields` é o **modelo**, e ele não respeita o contrato à risca:
 * manda campo sem `label`, sem `type`, ou só o nome em texto. O agente já
 * normaliza (`human.pergunta_dos_argumentos`), e esta é a segunda barreira: um
 * campo malformado não pode derrubar a tela da conversa.
 */
export function normalizarCampos(bruto: unknown): ChatAskField[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.flatMap((item, indice): ChatAskField[] => {
    if (typeof item === 'string') {
      return item.trim() ? [{ name: `campo_${indice}`, label: item.trim(), type: 'text' }] : [];
    }
    if (!item || typeof item !== 'object') return [];
    const campo = item as Partial<ChatAskField>;
    const label = String(campo.label || campo.name || '').trim();
    if (!label) return [];
    return [
      {
        name: String(campo.name || `campo_${indice}`),
        label,
        type: TIPOS.includes(campo.type as ChatAskField['type'])
          ? (campo.type as ChatAskField['type'])
          : 'text',
        required: campo.required === true,
        ...(Array.isArray(campo.options) ? { options: campo.options.map(String) } : {}),
      },
    ];
  });
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
function respostaDaPergunta(campos: ChatAskField[], valores: Record<string, string>): unknown {
  if (campos.length === 1 && campos[0].name === '__livre') return valores.__livre ?? '';
  return Object.fromEntries(
    campos.filter((c) => (valores[c.name] ?? '') !== '').map((c) => [c.label, valores[c.name]]),
  );
}

function Pergunta({
  acao,
  valores,
  onMudar,
}: {
  acao: ChatQuestionAction;
  valores: Record<string, string>;
  onMudar: (nome: string, valor: string) => void;
}) {
  const campos = camposDe(acao);
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
function camposDe(acao: ChatQuestionAction): ChatAskField[] {
  const campos = normalizarCampos(acao.fields);
  return campos.length > 0 ? campos : [{ name: '__livre', label: 'Sua resposta', type: 'text' }];
}

function Acoes({ pausa, ocupado, onResponder }: Props) {
  const escritas = useMemo(
    () => pausa.actions.filter((a): a is ChatConfirmAction => a.kind === 'confirm'),
    [pausa.actions],
  );
  const perguntas = useMemo(
    () => pausa.actions.filter((a): a is ChatQuestionAction => a.kind === 'question'),
    [pausa.actions],
  );
  const [decisoes, setDecisoes] = useState<Record<string, boolean>>({});
  const [respostas, setRespostas] = useState<Record<string, Record<string, string>>>({});

  const faltaDecidir = escritas.some((acao) => decisoes[acao.toolCallId] === undefined);
  const faltaResponder = perguntas.some((acao) =>
    camposDe(acao).some(
      (campo) =>
        (campo.required || campo.name === '__livre') &&
        !(respostas[acao.toolCallId]?.[campo.name] ?? '').trim(),
    ),
  );
  // Uma escrita sozinha responde no clique: um segundo botão "enviar" para uma
  // decisão só seria atrito. Com mais de uma coisa na mesa, a pessoa decide cada
  // uma e envia no fim — aprovar uma e recusar outra é o comportamento certo.
  const soUmaEscrita = escritas.length === 1 && perguntas.length === 0;

  function enviar(extra: Record<string, boolean> = {}) {
    const aprovacoes = { ...decisoes, ...extra };
    onResponder({
      approvals: aprovacoes,
      answers: Object.fromEntries(
        perguntas.map((acao) => [
          acao.toolCallId,
          respostaDaPergunta(camposDe(acao), respostas[acao.toolCallId] ?? {}),
        ]),
      ),
    });
  }

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (!faltaDecidir && !faltaResponder) enviar();
  }

  const titulo =
    escritas.length > 1
      ? `${escritas.length} ações aguardando confirmação`
      : escritas.length === 1
        ? 'Ação aguardando confirmação'
        : 'Pergunta do assistente';

  return (
    <form
      role="group"
      aria-label={titulo}
      onSubmit={aoEnviar}
      className={cn(floating, 'w-full space-y-3 rounded-xl p-4')}
    >
      {escritas.length > 0 ? (
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />
          <div>
            <p className="text-sm font-bold text-foreground">
              {escritas.length > 1 ? 'Confirmar estas ações?' : 'Confirmar esta ação?'}
            </p>
            {/* A garantia da ADR 022 dita para quem decide: enquanto este cartão
                está na tela, o banco não mudou. */}
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nada foi salvo ainda. Confira os dados antes de confirmar.
            </p>
          </div>
        </div>
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

      {escritas.map((acao, indice) => (
        <Escrita
          key={acao.toolCallId}
          acao={acao}
          decisao={decisoes[acao.toolCallId]}
          ocupado={ocupado}
          focar={indice === 0 && perguntas.length === 0}
          onDecidir={(aprovada) => {
            if (soUmaEscrita) {
              enviar({ [acao.toolCallId]: aprovada });
              return;
            }
            setDecisoes((atual) => ({ ...atual, [acao.toolCallId]: aprovada }));
          }}
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
          {ocupado ? 'Enviando…' : 'Enviar'}
        </button>
      )}
    </form>
  );
}

/** O orçamento acabou. O resumo é o que permite decidir sem adivinhar. */
function Continuar({ pausa, ocupado, onResponder }: Props) {
  return (
    <section
      role="group"
      aria-label="O assistente pede para continuar"
      className={cn(floating, 'w-full space-y-3 rounded-xl p-4')}
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
          Parar por aqui
        </button>
      </div>
    </section>
  );
}
