'use client';

import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** As linhas que contam: sem espaço sobrando e sem a vazia. */
export function cleanLines(lines: readonly string[]): string[] {
  return lines.map((l) => l.trim()).filter(Boolean);
}

export function sameLines(a: readonly string[], b: readonly string[]): boolean {
  const x = cleanLines(a);
  const y = cleanLines(b);
  return x.length === y.length && x.every((l, i) => l === y[i]);
}

/**
 * Lista numerada de linhas digitáveis (Pn-11 e Pn-11b): "Passos de execução"
 * e "Erros comuns". Cada linha é um campo, com o número à esquerda e o "×"
 * para tirar; "+ Passo" acrescenta uma no fim.
 */
export function LinesEditor({
  noun,
  addLabel,
  lines,
  onChange,
  max,
  placeholder,
  disabled,
}: {
  /** "Passo" → os campos se chamam "Passo 1", "Passo 2"… */
  noun: string;
  /** "Adicionar passo": o nome do botão para o leitor de tela. */
  addLabel: string;
  lines: string[];
  onChange: (lines: string[]) => void;
  max: number;
  placeholder?: (index: number) => string | undefined;
  disabled?: boolean;
}) {
  const set = (i: number, value: string) => onChange(lines.map((l, j) => (j === i ? value : l)));
  return (
    <div className="space-y-2">
      {lines.length > 0 && (
        <ol className="divide-y divide-subtle overflow-hidden rounded-xl border border-subtle bg-card">
          {lines.map((line, i) => (
            <li key={i} className="flex items-center gap-3 px-3">
              <span
                aria-hidden
                className="w-4 shrink-0 text-center font-display text-sm font-semibold tabular-nums"
              >
                {i + 1}
              </span>
              <input
                aria-label={`${noun} ${i + 1}`}
                value={line}
                maxLength={300}
                disabled={disabled}
                placeholder={placeholder?.(i)}
                onChange={(e) => set(i, e.target.value)}
                className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70 disabled:opacity-70"
              />
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Tirar ${noun.toLowerCase()} ${i + 1}`}
                  onClick={() => onChange(lines.filter((_, j) => j !== i))}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {!disabled && lines.length < max && (
        <button
          type="button"
          aria-label={addLabel}
          onClick={() => onChange([...lines, ''])}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-muted',
          )}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {noun}
        </button>
      )}
    </div>
  );
}

/** Título de seção com a explicação curta ao lado, como nas pranchas. */
export function FieldHead({ title, hint, id }: { title: string; hint?: string; id?: string }) {
  return (
    <p id={id} className="text-sm font-medium">
      {title}
      {hint && <span className="font-normal text-muted-foreground"> · {hint}</span>}
    </p>
  );
}
