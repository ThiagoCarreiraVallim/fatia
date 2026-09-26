'use client';

import { useState } from 'react';
import type { ChatReviewReason } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { floating, ghostButton, inkButton } from '@/components/elements/surfaces';
import { useVoto } from './chat-runtime-provider';

/**
 * O "por quê" de um 👎 — **depois** do voto, e opcional.
 *
 * O voto já foi gravado no clique. Exigir o motivo para registrar perderia o
 * feedback de quem tem pressa, que é a maioria; um 👍 não abre nada — não há o
 * que perguntar sobre uma resposta que serviu. A lista é fechada porque é o que
 * dá para somar; o texto livre vai à parte.
 */

const MOTIVOS: { valor: ChatReviewReason; rotulo: string }[] = [
  { valor: 'incorrect', rotulo: 'Informação errada' },
  { valor: 'wrong_data', rotulo: 'Usou os dados errados' },
  { valor: 'incomplete', rotulo: 'Incompleta' },
  { valor: 'did_not_follow', rotulo: 'Não fez o que pedi' },
  { valor: 'slow', rotulo: 'Demorou demais' },
  { valor: 'other', rotulo: 'Outro' },
];

export function MotivoDoVoto() {
  const voto = useVoto();
  const [escolhidos, setEscolhidos] = useState<ChatReviewReason[]>([]);
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  if (!voto?.pendente) return null;
  const linha = voto.pendente;

  async function enviar() {
    if (!voto) return;
    setEnviando(true);
    const ok = await voto.enviarMotivo(linha, escolhidos, nota.trim());
    setEnviando(false);
    if (ok) {
      setEscolhidos([]);
      setNota('');
    }
  }

  return (
    <section
      role="group"
      aria-label="O que faltou nesta resposta?"
      className={cn(floating, 'w-full space-y-3 rounded-xl p-4')}
    >
      <p className="text-sm font-semibold text-foreground">O que faltou nesta resposta?</p>
      <div className="flex flex-wrap gap-1.5">
        {MOTIVOS.map(({ valor, rotulo }) => {
          const ativo = escolhidos.includes(valor);
          return (
            <button
              key={valor}
              type="button"
              aria-pressed={ativo}
              onClick={() =>
                setEscolhidos((atual) =>
                  ativo ? atual.filter((m) => m !== valor) : [...atual, valor],
                )
              }
              className={cn(
                ativo ? inkButton : ghostButton,
                'rounded-full border border-border px-3 py-1 text-xs',
              )}
            >
              {rotulo}
            </button>
          );
        })}
      </div>
      <textarea
        aria-label="Comentário (opcional)"
        placeholder="Comentário (opcional)"
        maxLength={2000}
        value={nota}
        onChange={(evento) => setNota(evento.target.value)}
        className="min-h-16 w-full rounded-lg border border-border bg-transparent p-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={enviando || (escolhidos.length === 0 && !nota.trim())}
          onClick={() => void enviar()}
          className={cn(inkButton, 'rounded-full px-4 py-2 text-sm font-bold disabled:opacity-50')}
        >
          Enviar
        </button>
        <button
          type="button"
          onClick={voto.dispensar}
          className={cn(ghostButton, 'rounded-full px-4 py-2 text-sm')}
        >
          Agora não
        </button>
      </div>
    </section>
  );
}
