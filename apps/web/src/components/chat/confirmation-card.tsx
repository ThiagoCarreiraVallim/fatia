'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ChatToolProposal } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { field, floating, ghostButton, inkButton, mono } from '../elements/surfaces';

/**
 * A confirmação de uma ação que o agente propôs e não executou (ADR 022).
 *
 * **Um cartão no fim da conversa, e não um popup sobreposto.** A decisão é sobre
 * o que acabou de ser dito, e o contexto que a torna decidível — "200 g de
 * frango" — está na mensagem acima. Um overlay que cobre a conversa esconde
 * exatamente o que a pessoa precisa reler antes de clicar, e num celular cobre a
 * tela inteira para pedir um sim.
 *
 * Sem `role="dialog"` pelo mesmo motivo: não há nada para fechar, e trap de foco
 * num cartão que é parte do fluxo prenderia a navegação por teclado numa região
 * que a pessoa pode legitimamente querer deixar para reler a conversa. O que ele
 * tem é `role="group"` com nome, que é o que faz o leitor de tela anunciar a
 * região ao entrar nela.
 */

/** Rótulo legível para os nomes de tool que o chat pode propor. */
const ROTULOS: Record<string, string> = {
  add_meal_item: 'Adicionar item à refeição',
  log_meal: 'Registrar refeição',
  log_set: 'Registrar série',
  log_steps: 'Registrar passos',
  log_water: 'Registrar água',
  log_weight: 'Registrar peso',
  set_nutrition_goals: 'Definir metas de nutrição',
  start_workout_session: 'Iniciar treino',
  update_meal: 'Alterar refeição',
  update_meal_item: 'Alterar item da refeição',
};

/**
 * `log_meal` → "Registrar refeição", e o que não estiver no mapa vira
 * "Registrar refeição" a partir do próprio nome.
 *
 * O fallback existe porque o catálogo tem 37 tools confirmáveis e cresce sem
 * passar por aqui: uma tool nova mostraria `undefined` no lugar do rótulo, e um
 * cartão que pede confirmação sem dizer do quê é pior que um rótulo tosco.
 */
function rotulo(nome: string): string {
  const conhecido = ROTULOS[nome];
  if (conhecido) return conhecido;
  return nome.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * O JSON dos argumentos como lista legível, ou o texto cru quando não dá.
 *
 * Cru em vez de nada: a pessoa está autorizando uma escrita, e esconder o que vai
 * ser escrito porque o formato surpreendeu é o oposto do que este cartão existe
 * para fazer.
 */
function campos(argumentos: string): Array<[string, string]> | null {
  if (!argumentos.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(argumentos);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return Object.entries(parsed as Record<string, unknown>).map(([chave, valor]) => [
      chave,
      typeof valor === 'string' ? valor : JSON.stringify(valor),
    ]);
  } catch {
    return null;
  }
}

function Proposta({ proposta }: { proposta: ChatToolProposal }) {
  const lista = campos(proposta.arguments);

  return (
    <div className={cn(field, 'rounded-lg p-3 text-xs')}>
      <p className="font-semibold text-foreground">{rotulo(proposta.name)}</p>
      <p className={cn(mono, 'mt-0.5 text-foreground/45')}>{proposta.name}</p>

      {lista === null ? (
        <pre className={cn(mono, 'mt-2 whitespace-pre-wrap break-all text-foreground/70')}>
          {proposta.arguments}
        </pre>
      ) : lista.length === 0 ? null : (
        <dl className="mt-2 space-y-0.5">
          {lista.map(([chave, valor]) => (
            <div key={chave} className="flex gap-2">
              <dt className="text-foreground/50">{chave}</dt>
              <dd className="break-all text-foreground/80">{valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export interface ConfirmationCardProps {
  propostas: ChatToolProposal[];
  onAprovar: () => void;
  onRecusar: () => void;
  /** `true` enquanto o turno da aprovação está rodando. Trava os dois botões. */
  executando?: boolean;
}

export function ConfirmationCard({
  propostas,
  onAprovar,
  onRecusar,
  executando = false,
}: ConfirmationCardProps) {
  const confirmar = useRef<HTMLButtonElement>(null);
  const pendente = propostas.length > 0;

  useEffect(() => {
    // O foco vai para "Confirmar" quando o cartão aparece: quem conversa pelo
    // teclado estava no campo de texto, e sem isto teria de tabular por toda a
    // conversa para alcançar a decisão que acabou de ser pedida.
    //
    // A dependência é a **transição** para pendente, e não `[]`: este componente
    // fica montado com a lista vazia durante toda a conversa, e um efeito de
    // montagem rodaria uma vez, no início, com nada para focar.
    if (pendente) confirmar.current?.focus();
  }, [pendente]);

  if (!pendente) return null;

  const varias = propostas.length > 1;

  return (
    <section
      role="group"
      aria-label={
        varias ? `${propostas.length} ações aguardando confirmação` : 'Ação aguardando confirmação'
      }
      className={cn(floating, 'w-full space-y-3 rounded-xl p-4')}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />
        <div>
          <p className="text-sm font-bold text-foreground">
            {varias ? 'Confirmar estas ações?' : 'Confirmar esta ação?'}
          </p>
          {/* A frase é a garantia da ADR 022 dita para quem está decidindo: enquanto
              este cartão está na tela, o banco não mudou. */}
          <p className="mt-0.5 text-xs text-muted-foreground">
            Nada foi salvo ainda. Confira os dados antes de confirmar.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {propostas.map((proposta) => (
          <Proposta key={proposta.id} proposta={proposta} />
        ))}
      </div>

      <div className="flex gap-2">
        <button
          ref={confirmar}
          type="button"
          onClick={onAprovar}
          disabled={executando}
          className={cn(
            inkButton,
            'rounded-full px-4 py-2 text-sm font-bold',
            executando && 'pointer-events-none opacity-50',
          )}
        >
          {executando ? 'Salvando…' : varias ? 'Confirmar todas' : 'Confirmar'}
        </button>
        {/* Nunca desabilitado por texto digitado: recusar é a saída, e uma saída
            que depende de preencher algo não é saída. Só o turno em andamento a
            trava, porque aí a escrita já saiu. */}
        <button
          type="button"
          onClick={onRecusar}
          disabled={executando}
          className={cn(
            ghostButton,
            'rounded-full px-4 py-2 text-sm',
            executando && 'pointer-events-none opacity-50',
          )}
        >
          Cancelar
        </button>
      </div>
    </section>
  );
}
