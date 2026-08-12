'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { inkButton, floating, field } from '../elements/surfaces';

/**
 * Modal de confirmação visual para ferramentas CONFIRMABLE do agente.
 *
 * Disparado quando o evento SSE tem tipo `proposta` — o NestJS repassa do
 * agente LangGraph via stream `/chat`. O modal usa design system swervable
 * (paper, floating) com botões ink/ghostButton, e reutiliza a lógica de
 * `MobileComposer` para o input de texto.
 */

export interface ConfirmationModalProps {
  /** Nome da tool proposta (ex.: "log_meal"). */
  nomeTool: string;
  /** Argumentos JSON que o modelo pediu para usar. */
  argumentos: string;
  /** Motivo humano-legível da operação pendente. */
  motivo?: string;
  /** Callback chamado quando a decisão do usuário é finalizada (aprovado ou rejeitado). */
  onConclusao?: () => void;
}

/**
 * Identifica se a mensagem atual é um evento de proposta do agente.
 *
 * O NestJS emite `proposta` como parte do stream SSE; o cliente detecta por
 * tipo no switch e exibe este modal em vez de mostrar o texto normal.
 */
function isPropostaEvento(evento: ChatStreamEvent): evento is {
  type: 'proposta';
  data: ConfirmationModalProps;
} {
  return (
    evento.type === 'proposta' &&
    typeof evento.data.nomeTool === 'string' &&
    typeof evento.data.argumentos === 'string'
  );
}

interface ChatStreamEvent {
  type: string;
  data?: Record<string, unknown>;
  tool?: { id: string; name: string };
}

export function ConfirmationModal({
  nomeTool,
  argumentos,
  motivo = `Confirmar chamada de ${nomeTool}?`,
  onConclusao,
}: ConfirmationModalProps) {
  const [valorUsuario, setValorUsuario] = useState('');
  const [aprovado, setAprovado] = useState(false);
  const [rejeitado, setRejeitado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Foca no input ao montar o modal.
    inputRef.current?.focus();
  }, []);

  /**
   * O usuário pode aprovar com texto/emoji ("confirmar", "ok", "👍") ou rejeitar
   * com recuo ("cancelar", "não", "❌"). A regra é simples: resposta positiva =
   * aprova; negativa = cancela. Tudo mais vira "esperando" para que ele digite
   * algo reconhecível.
   */
  const avaliar = useCallback(
    (resposta: string) => {
      const r = resposta.trim().toLowerCase();
      if (!r) return;

      const positivas = ['confirmar', 'ok', 'sim', '+1', '👍', 'thumb_up'];
      const negativas = ['cancelar', 'não', 'nao', '-1', '❌', 'cancel'];

      if (positivas.some((p) => r === p)) {
        setAprovado(true);
        onConclusao?.();
      } else if (negativas.some((n) => r === n)) {
        setRejeitado(true);
        onConclusao?.();
      }
    },
    [onConclusao],
  );

  /**
   * Limpa o estado ao desmontar: evita que um modal anterior "vazue" aprova o
   * para outro. O valor do input também zera.
   */
  useEffect(() => {
    return () => setValorUsuario('');
  }, []);

  /**
   * Quando a decisão é finalizada (aprovado ou rejeitado), limpa os estados
   * internos e chama o callback do pai. Isso evita que o modal "vazue" aprova o
   * para outro caso.
   */
  useEffect(() => {
    if (aprovado || rejeitado) {
      setAprovado(false);
      setRejeitado(false);
      onConclusao?.();
    }
  }, [aprovado, rejeitado]);

  const label = aprovado ? 'Confirmado' : rejeitado ? 'Recusado' : '';
  const activeLabel = motivo;
  const estado: 'running' | 'done' | 'error' = aprovado || rejeitado ? 'done' : 'running';

  return (
    <div className={cn(floating, 'max-w-sm rounded-xl p-4 space-y-3')}>
      {/* Rótulo de status — substitui o primeiro quadro da tool */}
      <p className="text-sm font-semibold text-foreground/80">{label}</p>

      {/* Campo com detalhes do que está pendente */}
      <div className={cn(field, 'rounded-lg p-3 text-xs whitespace-pre-wrap break-all')}>
        <p className="font-mono mb-1 text-foreground/55">Tool proposta</p>
        <p>{nomeTool}</p>
        <p className="mt-2 font-mono text-foreground/40">{argumentos.slice(0, 300)}</p>
      </div>

      {/* Motivo humano-legível */}
      {motivo && (
        <p className="text-sm text-foreground/75">{motivo}</p>
      )}

      {/* Input de texto — reutiliza o padrão do MobileComposer */}
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={valorUsuario}
        onChange={(e) => setValorUsuario(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') avaliar(valorUsuario);
        }}
        className={cn(
          fieldInteractive,
          'rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/20',
        )}
        placeholder="Responda para aprovar (ex.: 👍 confirmar) ou recuar"
      />

      {/* Botões de ação — inkButton = aprovar, ghostButton = cancelar */}
      <div className="flex gap-2">
        <button
          onClick={() => avaliar(valorUsuario)}
          disabled={!valorUsuario.trim()}
          className={cn(inkButton, 'rounded-full px-4 py-2 text-sm', !valorUsuario.trim() && 'opacity-50')}
        >
          Confirmar
        </button>
        <button
          onClick={() => {
            setValorUsuario('');
            avaliar('cancelar');
          }}
          disabled={!valorUsuario.trim()}
          className={cn(ghostButton, 'rounded-full px-4 py-2 text-sm')}
        >
          Recuar
        </button>
      </div>

      {/* Estado final — substitui o segundo quadro */}
      {aprovado && <p className="text-emerald-500 text-xs">Aprovação registrada.</p>}
      {rejeitado && <p className="text-red-400 text-xs">Operação cancelada.</p>}
    </div>
  );
}

export default ConfirmationModal;
