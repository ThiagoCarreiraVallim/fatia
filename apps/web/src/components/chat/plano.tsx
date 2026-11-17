'use client';

import { Check, Circle, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { field } from '@/components/elements/surfaces';
import { usePlanoDoTurno } from './chat-runtime-provider';

/**
 * Os passos que o agente se deu para um pedido de várias etapas (evento `plan`).
 *
 * Só aparece quando o planejador está ligado (`AGENT_CHAT_PLANNER`) e o pedido
 * pediu mais de um passo. Some quando o próximo turno começa.
 */
export function PlanoDoTurno() {
  const plano = usePlanoDoTurno();
  if (!plano?.length) return null;
  const feitos = plano.filter((passo) => passo.status === 'done').length;
  return (
    <section aria-label="Plano" className={cn(field, 'w-full rounded-2xl px-3.5 py-3')}>
      <h2 className="flex items-baseline justify-between pb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/50">
        Plano
        {/* Prancha IA-Estados: o andamento em número, além dos ícones. */}
        <span className="font-normal normal-case tracking-normal tabular-nums">
          {feitos} de {plano.length} passos
        </span>
      </h2>
      <ol className="flex flex-col gap-1 text-sm">
        {plano.map((passo) => (
          <li
            key={passo.id}
            aria-current={passo.status === 'running' ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2',
              passo.status === 'done' ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {passo.status === 'done' ? (
              <Check size={14} aria-hidden className="shrink-0 text-success" />
            ) : passo.status === 'running' ? (
              <LoaderCircle
                size={14}
                aria-hidden
                className="shrink-0 animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Circle size={14} aria-hidden className="shrink-0 text-foreground/30" />
            )}
            <span>{passo.title}</span>
            <span className="sr-only">
              {passo.status === 'done'
                ? '(feito)'
                : passo.status === 'running'
                  ? '(em andamento)'
                  : '(a fazer)'}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
