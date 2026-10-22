'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  CUSTOM_EQUIPMENT_MAX_LENGTH,
  customEquipmentName,
  customEquipmentProblem,
  groupExerciseApi,
  MAX_CUSTOM_EQUIPMENT,
  type GymEquipmentState,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { EquipmentChip, EquipmentChooser } from '@/components/workout/equipment-chooser';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

/**
 * O equipamento da academia, no painel: a lista inteira por categoria, com
 * busca, e os equipamentos que a academia nomeia por conta própria. Réplica de
 * `apps/mobile/src/components/org/gym-equipment-drawer.tsx`.
 *
 * Modal e não card na tela: são sessenta e tantos itens, e a busca precisa
 * ficar à mão enquanto a lista rola. Só o dono salva (`group.update` na API);
 * a equipe vê a lista sem mexer.
 */
export function GymEquipmentDialog({
  groupId,
  canEdit,
  saved,
  open,
  onOpenChange,
}: {
  groupId: string;
  canEdit: boolean;
  /** O que está gravado, da bancada que a tela já carregou. */
  saved: GymEquipmentState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  // Reespelha o que está salvo a cada abertura, e quando a bancada volta do
  // servidor. Ajuste durante o render, e não num efeito (#187).
  const current = open ? saved : undefined;
  const [mirrored, setMirrored] = useState<typeof current>(undefined);
  if (current !== mirrored) {
    setMirrored(current);
    if (current) {
      setChecked(new Set(current.equipment));
      setCustom(current.customEquipment);
      setQuery('');
      setDraft('');
      setProblem(null);
    }
  }

  const changed =
    checked.size !== saved.equipment.length ||
    saved.equipment.some((e) => !checked.has(e)) ||
    custom.join('\n') !== saved.customEquipment.join('\n');

  const save = useMutation({
    // Manda os próprios sempre: sem o campo, a API mantém os que estão, e o
    // que o dono removeu aqui voltaria.
    mutationFn: () => groupExerciseApi.setEquipment(groupId, [...checked], custom),
    onSuccess: () => {
      toast('Equipamento salvo.');
      void qc.invalidateQueries({ queryKey: orgKeys.exercises(groupId) });
      onOpenChange(false);
    },
    onError: (err) =>
      toast(
        err instanceof ApiError && err.status < 500 && err.message
          ? err.message
          : 'Não deu para salvar agora.',
      ),
  });

  function addCustom() {
    const p = customEquipmentProblem(draft, custom);
    setProblem(p);
    if (p) return;
    setCustom([...custom, customEquipmentName(draft)]);
    setDraft('');
  }

  function toggle(key: string) {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setChecked(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col">
        <DialogHeader>
          <DialogTitle>Equipamento da academia</DialogTitle>
          <DialogDescription>
            {canEdit
              ? `O filtro "Na minha academia" mostra o que dá para fazer com isto. Peso corporal vale sempre. ${checked.size + custom.length} marcado(s).`
              : 'Só o dono muda. O filtro "Na minha academia" usa esta lista.'}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            aria-label="Buscar equipamento"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar: smith, esteira, polia…"
            className="pl-9"
          />
        </div>

        <div className="-mx-1 min-h-0 flex-1 space-y-5 overflow-y-auto px-1 py-1">
          {canEdit && (
            <section
              aria-label="Equipamentos próprios"
              className="space-y-2 rounded-2xl border border-subtle bg-card p-3"
            >
              <h3 className="text-sm font-bold">Equipamentos próprios</h3>
              <p className="text-xs text-muted-foreground">
                {`O que a lista não tem, com o nome que a casa usa. Até ${MAX_CUSTOM_EQUIPMENT}.`}
              </p>
              {custom.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {custom.map((c) => (
                    <EquipmentChip
                      key={c}
                      label={c}
                      on
                      onRemove={() => setCustom(custom.filter((x) => x !== c))}
                    />
                  ))}
                </div>
              )}
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addCustom();
                }}
              >
                <Input
                  aria-label="Nome do equipamento próprio"
                  aria-invalid={!!problem}
                  aria-describedby={problem ? 'custom-equipment-problem' : undefined}
                  maxLength={CUSTOM_EQUIPMENT_MAX_LENGTH}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (problem) setProblem(null);
                  }}
                  placeholder="Ex.: Hack 45° da casa"
                />
                <Button type="submit" size="sm" variant="outline">
                  Adicionar
                </Button>
              </form>
              {problem && (
                <p id="custom-equipment-problem" role="alert" className="text-xs text-destructive">
                  {problem}
                </p>
              )}
            </section>
          )}

          <EquipmentChooser
            query={query}
            disabled={!canEdit}
            // Para o dono, os próprios ficam no cartão acima, onde se apagam.
            custom={canEdit ? [] : custom}
            isSelected={(k) => checked.has(k) || custom.includes(k)}
            onPick={toggle}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {canEdit ? 'Cancelar' : 'Fechar'}
          </Button>
          {canEdit && (
            <Button disabled={!changed || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Salvando…' : 'Salvar equipamento'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
