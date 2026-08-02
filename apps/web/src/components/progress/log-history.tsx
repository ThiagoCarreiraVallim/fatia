'use client';

import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface LogHistoryEntry {
  id: string;
  /** Valor do registro, em destaque. */
  title: string;
  /** Data ou origem do registro. */
  subtitle: string;
}

interface Props {
  entries: LogHistoryEntry[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  editingId: string | null;
  onEdit: (entry: LogHistoryEntry) => void;
  onDelete: (entry: LogHistoryEntry) => void;
  /** Registro com exclusão em voo: a linha some aos poucos até a API responder. */
  pendingId: string | null;
  /**
   * Há uma exclusão em voo — qualquer uma. Trava a lista inteira, e não só a
   * linha de `pendingId`.
   *
   * Os drawers usam uma `useMutation` para a lista toda. Se uma segunda
   * exclusão começar antes de a primeira responder, o observer migra para ela e
   * o erro da primeira nunca chega à tela: a linha continua listada, sem
   * mensagem nenhuma, e quem apagou lê isso como "ainda não atualizou". Falha
   * silenciosa em ação destrutiva é pior que a espera de meio segundo.
   */
  isDeleting: boolean;
  emptyLabel: string;
  confirmLabel: string;
}

/**
 * Lista de registros já salvos, com editar e apagar.
 *
 * Porte de `apps/mobile/src/components/progress/log-history.tsx` — direção
 * inversa da habitual, porque o app nativo resolveu a #116 primeiro. Até aqui o
 * PWA só sabia criar peso, passos e água: corrigir um número errado dependia de
 * pedir ao Claude, embora a API sempre tenha aceitado `PATCH` e `DELETE`.
 *
 * A lista mora dentro dos drawers, e não numa seção de `/progress`, porque os
 * drawers também abrem do dashboard — quem digitou errado ali precisa da
 * correção no mesmo lugar em que errou.
 */
export function LogHistory({
  entries,
  isLoading,
  isError,
  onRetry,
  editingId,
  onEdit,
  onDelete,
  pendingId,
  isDeleting,
  emptyLabel,
  confirmLabel,
}: Props) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  // Derivado, e não um segundo estado: um refetch pode tirar da janela o
  // registro que estava em confirmação, e assim a pergunta desaparece sozinha
  // em vez de ficar pendurada num id que não existe mais.
  const confirming = entries.find((entry) => entry.id === confirmingId) ?? null;

  // O botão que abriu a pergunta some do DOM no mesmo commit, e o foco iria
  // para o `<body>` — quem navega por teclado recomeçaria do zero no meio de
  // uma ação destrutiva. `autoFocus` não serve aqui: a ordem em que ele roda em
  // relação à remoção do botão de lixeira não é confiável.
  useEffect(() => {
    if (confirmingId) confirmButtonRef.current?.focus();
  }, [confirmingId]);

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold tracking-wide text-muted-foreground">
        REGISTROS RECENTES
      </p>

      {/* Região viva montada sempre, e não junto com a pergunta: um
          `aria-live` que nasce já preenchido costuma não ser anunciado. */}
      <p role="status" aria-live="polite" className="sr-only">
        {confirming ? `${confirmLabel} ${confirming.title}, ${confirming.subtitle}.` : ''}
      </p>

      {isLoading && <p className="py-4 text-center text-xs text-muted-foreground">Carregando…</p>}

      {!isLoading && isError && (
        <div className="flex items-center justify-between py-3 text-sm">
          <span className="text-rose-500">Erro ao carregar os registros.</span>
          <button type="button" onClick={onRetry} className="text-primary underline">
            Tentar novamente
          </button>
        </div>
      )}

      {!isLoading && !isError && entries.length === 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">{emptyLabel}</p>
      )}

      {entries.length > 0 && (
        // `data-vaul-no-drag`: sem ele o gesto de rolar a lista é lido pelo
        // vaul como arrastar o sheet para baixo, e o drawer fecha na cara de
        // quem só queria ver o registro de ontem. A altura precisa ser limitada
        // ou a lista empurra os botões para fora da tela.
        <ul data-vaul-no-drag className="max-h-[190px] space-y-1.5 overflow-y-auto">
          {entries.map((entry) => {
            const isEditing = entry.id === editingId;
            const isPending = entry.id === pendingId;
            const isConfirming = entry.id === confirmingId;

            return (
              <li
                key={entry.id}
                className={cn(
                  'flex items-center gap-2 rounded-xl bg-card px-3 py-2',
                  isEditing && 'border border-primary',
                  isPending && 'opacity-50',
                )}
              >
                {isConfirming ? (
                  <>
                    <p className="min-w-0 flex-1 text-sm font-medium">{confirmLabel}</p>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      // O foco vai para a confirmação, e não para "Cancelar":
                      // quem chegou aqui já disse o que quer. Não há disparo
                      // acidental herdado da mesma tecla — o clique do botão
                      // anterior já foi entregue antes deste existir.
                      ref={confirmButtonRef}
                      disabled={isDeleting}
                      onClick={() => {
                        setConfirmingId(null);
                        onDelete(entry);
                      }}
                    >
                      Apagar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmingId(null)}
                    >
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{entry.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{entry.subtitle}</p>
                    </div>
                    {/* O rótulo carrega o valor, e não só a data. Água tem
                        vários registros por dia por definição: com a data
                        sozinha saíam N botões "Apagar registro de 17 mai"
                        indistinguíveis no leitor de tela, bem na ação
                        irreversível. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0"
                      aria-label={`Editar registro de ${entry.title}, ${entry.subtitle}`}
                      aria-pressed={isEditing}
                      disabled={isDeleting}
                      onClick={() => onEdit(entry)}
                    >
                      <Pencil className={cn(isEditing && 'text-primary')} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0 text-muted-foreground"
                      aria-label={`Apagar registro de ${entry.title}, ${entry.subtitle}`}
                      disabled={isDeleting}
                      onClick={() => setConfirmingId(entry.id)}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
