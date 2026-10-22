'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { elapsedLabel, pluralize, type SessionProgress } from './format';

/**
 * Cabeçalho da sessão: horário de início, tempo corrido, as duas saídas e o
 * progresso — o `session-header.tsx` do app. Antes o PWA mostrava só "Iniciado
 * às 18:00", e quanto do treino faltava era conta de cabeça descendo a lista.
 */
export function SessionHeader({
  startedAt,
  progress,
  onCancel,
  onFinish,
}: {
  startedAt: string;
  progress: SessionProgress;
  onCancel: () => void;
  onFinish: () => void;
}) {
  const elapsed = useElapsed(startedAt);
  const progressLabel = `${progress.done}/${progress.total} ${pluralize(progress.total, 'exercício', 'exercícios')}`;
  const time = new Date(startedAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        {/* O título "Treino em andamento" mora na barra de topo. */}
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          Iniciado às {time} · {elapsed}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="outline" size="sm" onClick={onFinish}>
            Finalizar
          </Button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div
          role="progressbar"
          aria-label="Progresso do treino"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          aria-valuetext={progressLabel}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.round(progress.ratio * 100)}%` }}
          />
        </div>
        <p className="text-[11px] font-bold text-muted-foreground tabular-nums">{progressLabel}</p>
      </div>
    </div>
  );
}

/** Relógio da sessão. Um minuto de resolução dispensa tique de segundo. */
function useElapsed(startedAt: string): string {
  const [label, setLabel] = useState(() => elapsedLabel(startedAt));

  // Troca de sessão recalcula durante o render, e não num efeito (#187): sem
  // pintar um quadro com o tempo da sessão anterior. O intervalo fica no efeito,
  // que é o lugar de assinar um temporizador.
  const [previousStartedAt, setPreviousStartedAt] = useState(startedAt);
  if (previousStartedAt !== startedAt) {
    setPreviousStartedAt(startedAt);
    setLabel(elapsedLabel(startedAt));
  }

  useEffect(() => {
    const id = setInterval(() => setLabel(elapsedLabel(startedAt)), 15_000);
    return () => clearInterval(id);
  }, [startedAt]);

  return label;
}
