'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Dumbbell, Plus, Trash2, Utensils } from 'lucide-react';
import { toast } from 'sonner';
import {
  memberFileApi,
  memberPlanProgress,
  memberPlanStatus,
  memberPlanWhen,
  moveId,
  type MemberFile,
  type MemberWorkoutPlan,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { fileKeys } from './keys';

const TONE: Record<string, string> = {
  active: 'bg-primary/15 text-primary',
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  scheduled: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  ended: 'bg-muted text-muted-foreground',
};

/**
 * Aba "Planos da Ana" (Pn-05p e Pn-05s). A ordem é a que ela vê no app
 * enquanto não reordena por lá; o primeiro ativo é o treino de hoje.
 * Rascunho, duplicar e editar a cópia chegam com os editores (#406, #407).
 */
export function FilePlans({
  file,
  firstName,
  onAdd,
}: {
  file: MemberFile;
  firstName: string;
  onAdd: () => void;
}) {
  const qc = useQueryClient();
  const [mostrarTerminados, setMostrarTerminados] = useState(false);
  const [apagando, setApagando] = useState<MemberWorkoutPlan | null>(null);
  const [avisar, setAvisar] = useState(true);
  const refresh = () =>
    qc.invalidateQueries({ queryKey: fileKeys.file(file.groupId, file.membershipId) });

  const ordem = file.plans.workout.map((p) => p.offerId);
  const reordenar = useMutation({
    mutationFn: (ids: string[]) => memberFileApi.reorderPlans(file.groupId, file.membershipId, ids),
    onSuccess: () => void refresh(),
    onError: () => toast('Não deu para mudar a ordem.'),
  });
  const tirar = useMutation({
    mutationFn: (v: { offerId: string; endToday: boolean }) =>
      memberFileApi.removePlan(file.groupId, file.membershipId, v.offerId, {
        notify: avisar,
        endToday: v.endToday,
      }),
    onSuccess: (r) => {
      setApagando(null);
      toast(
        r.result === 'ended'
          ? 'Termina hoje · fica em Terminados'
          : `Apagado da ${firstName}${avisar ? ' · ela foi avisada' : ''}`,
      );
      void refresh();
    },
    onError: () => toast('Não deu para tirar o plano.'),
  });

  const visiveis = file.plans.workout.filter((p) => mostrarTerminados || p.status !== 'ENDED');
  const terminados =
    file.plans.workout.length - file.plans.workout.filter((p) => p.status !== 'ENDED').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground">{`Planos da ${firstName}`}</h2>
          <p className="text-xs text-muted-foreground">
            {file.plans.reorderedBySubject
              ? `A ${firstName} reordenou no app: a ordem daqui não muda mais a lista dela.`
              : 'A ordem é a que ela vê no app. O primeiro ativo é o treino de hoje.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {terminados > 0 && (
            <Button size="sm" variant="text" onClick={() => setMostrarTerminados((v) => !v)}>
              {mostrarTerminados ? 'Esconder terminados' : `Mostrar terminados (${terminados})`}
            </Button>
          )}
          {file.canSendPlans && (
            <Button size="sm" onClick={onAdd}>
              <Plus size={16} aria-hidden /> Da biblioteca
            </Button>
          )}
        </div>
      </div>

      <section className="rounded-2xl border border-subtle bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Dumbbell size={16} aria-hidden />
          {`Treino · ${file.plans.workout.length} ${file.plans.workout.length === 1 ? 'plano' : 'planos'}`}
        </h3>
        {visiveis.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {`Nenhum plano de treino mandado para a ${firstName} nesta comunidade.`}
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table aria-label="Treino" className="w-full text-left text-sm">
              <thead className="text-[11px] text-muted-foreground">
                <tr>
                  <th className="w-8 py-2 font-semibold">#</th>
                  <th className="py-2 font-semibold">Plano</th>
                  <th className="hidden py-2 font-semibold md:table-cell">Quando</th>
                  <th className="py-2 font-semibold">Status</th>
                  <th className="hidden py-2 font-semibold md:table-cell">Andamento</th>
                  <th className="py-2 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((p, k) => {
                  const st = memberPlanStatus(p.status);
                  const i = ordem.indexOf(p.offerId);
                  return (
                    <tr
                      key={p.offerId}
                      className={cn('border-t border-subtle', p.status === 'ENDED' && 'opacity-60')}
                    >
                      <td className="py-2 text-xs text-muted-foreground">{k + 1}</td>
                      <td className="py-2">
                        <b className="block text-foreground">{p.title}</b>
                        <span className="text-xs text-muted-foreground">
                          {[
                            p.authorName ? `enviado por ${p.authorName}` : null,
                            p.version > 1 ? `v${p.version}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {/* No celular, Quando vai sob o nome. */}
                        <span className="mt-0.5 block text-xs text-muted-foreground md:hidden">
                          {memberPlanWhen(p)}
                        </span>
                      </td>
                      <td className="hidden py-2 text-xs text-foreground md:table-cell">
                        {memberPlanWhen(p)}
                      </td>
                      <td className="py-2">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                            TONE[st.tone],
                          )}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="hidden py-2 text-xs text-muted-foreground md:table-cell">
                        {memberPlanProgress(p, file.name)}
                      </td>
                      <td className="py-2">
                        <span className="flex justify-end gap-1">
                          {file.canManagePlans && (
                            <>
                              <button
                                type="button"
                                aria-label="Subir"
                                disabled={i <= 0 || reordenar.isPending}
                                onClick={() => reordenar.mutate(moveId(ordem, p.offerId, -1))}
                                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30"
                              >
                                <ArrowUp size={16} aria-hidden />
                              </button>
                              <button
                                type="button"
                                aria-label="Descer"
                                disabled={i >= ordem.length - 1 || reordenar.isPending}
                                onClick={() => reordenar.mutate(moveId(ordem, p.offerId, 1))}
                                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30"
                              >
                                <ArrowDown size={16} aria-hidden />
                              </button>
                            </>
                          )}
                          {p.canRemove && (
                            <button
                              type="button"
                              aria-label={`Apagar ${p.title}`}
                              onClick={() => {
                                setAvisar(true);
                                setApagando(p);
                              }}
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-danger hover:bg-muted"
                            >
                              <Trash2 size={16} aria-hidden />
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-subtle bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Utensils size={16} aria-hidden />
          {`Alimentação · ${file.plans.nutrition.length} ${file.plans.nutrition.length === 1 ? 'plano' : 'planos'}`}
        </h3>
        {file.plans.nutrition.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {`Nenhum plano alimentar mandado para a ${firstName} nesta comunidade.`}
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {file.plans.nutrition.map((n) => (
              <li
                key={n.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2"
              >
                <span>
                  <b className="block text-sm text-foreground">{n.title}</b>
                  <span className="text-xs text-muted-foreground">{`${n.kcalMin}–${n.kcalMax} kcal`}</span>
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    n.status === 'ACCEPTED' ? TONE.active : TONE.pending,
                  )}
                >
                  {n.status === 'ACCEPTED' ? 'ativo' : 'aguardando aceite'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Mandar e editar plano alimentar por aqui chega com o editor de dieta.
        </p>
      </section>

      <section className="rounded-2xl border border-dashed border-border bg-card/30 p-4">
        <h3 className="text-sm font-bold text-foreground">Outros envios</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Questionários, hábitos e avaliações aparecem aqui quando existirem no painel.
        </p>
      </section>

      <Dialog open={apagando !== null} onOpenChange={(o) => !o && setApagando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{`Apagar “${apagando?.title ?? ''}” da ${firstName}?`}</DialogTitle>
            <DialogDescription>
              Ela deixa de ver o plano no app. O que ela já registrou continua no histórico dela. O
              original na biblioteca não muda.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2">
            <span className="text-sm text-foreground">{`Avisar a ${firstName} no app`}</span>
            <Switch
              checked={avisar}
              onCheckedChange={setAvisar}
              label={`Avisar a ${firstName} no app`}
            />
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="text" onClick={() => setApagando(null)}>
              Cancelar
            </Button>
            {apagando && apagando.status !== 'ENDED' && apagando.status !== 'PENDING' && (
              <Button
                variant="outline"
                disabled={tirar.isPending}
                onClick={() => tirar.mutate({ offerId: apagando.offerId, endToday: true })}
              >
                Terminar hoje
              </Button>
            )}
            <Button
              variant="danger"
              disabled={tirar.isPending}
              onClick={() =>
                apagando && tirar.mutate({ offerId: apagando.offerId, endToday: false })
              }
            >
              {`Apagar da ${firstName}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
