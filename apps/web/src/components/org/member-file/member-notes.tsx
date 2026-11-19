'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { toast } from 'sonner';
import { memberFileApi, relativeStamp, type MemberFile } from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { fileKeys } from './keys';

const MAX = 2000;

/**
 * Anotações da equipe (#402, parte da #301). Não são privadas: a pessoa lê no
 * app, só leitura, e a caixa avisa isso antes de qualquer coisa.
 */
export function MemberNotes({ file, now }: { file: MemberFile; now: Date }) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState<{ id: string; text: string } | null>(null);
  const refresh = () =>
    qc.invalidateQueries({ queryKey: fileKeys.file(file.groupId, file.membershipId) });

  const criar = useMutation({
    mutationFn: (text: string) => memberFileApi.createNote(file.groupId, file.membershipId, text),
    onSuccess: () => {
      setTexto('');
      void refresh();
    },
    onError: () => toast('Não deu para salvar a anotação.'),
  });
  const salvar = useMutation({
    mutationFn: (n: { id: string; text: string }) =>
      memberFileApi.updateNote(file.groupId, file.membershipId, n.id, n.text),
    onSuccess: () => {
      setEditando(null);
      void refresh();
    },
    onError: () => toast('Não deu para salvar a anotação.'),
  });
  const apagar = useMutation({
    mutationFn: (id: string) => memberFileApi.removeNote(file.groupId, file.membershipId, id),
    onSuccess: () => void refresh(),
    onError: () => toast('Não deu para apagar a anotação.'),
  });

  return (
    <section
      aria-labelledby="notas-titulo"
      className="rounded-2xl border border-subtle bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="notas-titulo" className="text-sm font-bold text-foreground">
          Anotações da equipe
        </h2>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Eye size={14} aria-hidden />O aluno vê estas anotações
        </span>
      </div>

      {file.canWriteNotes && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (texto.trim()) criar.mutate(texto.trim());
          }}
        >
          <Textarea
            aria-label="Nova anotação"
            placeholder="O que a equipe precisa lembrar sobre esta pessoa"
            rows={2}
            maxLength={MAX}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!texto.trim() || criar.isPending}>
              Anotar
            </Button>
          </div>
        </form>
      )}

      {file.notes.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Nenhuma anotação ainda.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {file.notes.map((n) => (
            <li key={n.id} className="rounded-xl bg-muted/40 px-3 py-2">
              {editando?.id === n.id ? (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editando.text.trim()) salvar.mutate(editando);
                  }}
                >
                  <Textarea
                    aria-label="Editar anotação"
                    rows={2}
                    maxLength={MAX}
                    value={editando.text}
                    onChange={(e) => setEditando({ id: n.id, text: e.target.value })}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="text"
                      onClick={() => setEditando(null)}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" size="sm" disabled={salvar.isPending}>
                      Salvar
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                    {n.text}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {`${n.isMine ? 'Você' : (n.authorName ?? 'Alguém que saiu')} · ${relativeStamp(
                        new Date(n.createdAt),
                        now,
                        file.timezone,
                      )}`}
                    </span>
                    {n.canEdit && (
                      <span className="flex gap-1">
                        <Button
                          size="sm"
                          variant="text"
                          onClick={() => setEditando({ id: n.id, text: n.text })}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="text"
                          className="text-danger"
                          onClick={() => apagar.mutate(n.id)}
                        >
                          Apagar
                        </Button>
                      </span>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
