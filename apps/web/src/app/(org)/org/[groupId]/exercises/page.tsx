'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dumbbell, Image as ImageIcon, Plus, Search, Video } from 'lucide-react';
import { toast } from 'sonner';
import {
  EQUIPMENT_LABEL,
  GYM_EQUIPMENT,
  groupExerciseApi,
  workoutApi,
  type GroupExercise,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { useOrgGroup } from '@/components/org/org-shell';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * O catálogo de exercícios da comunidade, pela equipe (Fase 7b): os exercícios
 * da casa, os tutoriais gravados por cima do catálogo geral e o equipamento
 * que a academia tem.
 */
export default function OrgExercisesPage() {
  const g = useOrgGroup();
  const [escolhendo, setEscolhendo] = useState(false);
  const lista = useQuery({
    queryKey: orgKeys.exercises(g.id),
    queryFn: () => groupExerciseApi.list(g.id),
  });
  const base = `/org/${g.id}/exercises`;

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Quem treina em {g.name} vê estes exercícios primeiro, com o vídeo, as fotos e as dicas da
        equipe no lugar do vídeo padrão.
      </p>

      {lista.data && (
        <EquipmentCard
          groupId={g.id}
          canEdit={g.role === 'OWNER'}
          equipment={lista.data.equipment}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={`${base}/new`} className={buttonVariants({ size: 'sm' })}>
          <Plus className="h-4 w-4" aria-hidden />
          Exercício da casa
        </Link>
        <Button size="sm" variant="outline" onClick={() => setEscolhendo(true)}>
          <Video className="h-4 w-4" aria-hidden />
          Tutorial para um exercício do catálogo
        </Button>
      </div>

      {lista.isPending ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : lista.data?.items.length ? (
        <ul className="space-y-2" aria-label="Exercícios da comunidade">
          {lista.data.items.map((e) => (
            <li key={e.exerciseId}>
              <ExerciseRow exercise={e} href={`${base}/${e.exerciseId}`} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Dumbbell}
          title="Nenhum exercício ainda"
          description="Crie os exercícios da casa ou grave o tutorial de um exercício do catálogo."
        />
      )}

      <CatalogPicker
        open={escolhendo}
        onOpenChange={setEscolhendo}
        existing={new Set(lista.data?.items.map((e) => e.exerciseId) ?? [])}
        base={base}
      />
    </div>
  );
}

function ExerciseRow({ exercise: e, href }: { exercise: GroupExercise; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-2xl border border-subtle bg-card p-3 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 space-y-0.5">
        <span className="block truncate text-sm font-semibold">{e.name}</span>
        <span className="block text-xs capitalize text-muted-foreground">
          {[e.muscleGroup, e.equipment].filter(Boolean).join(' · ')} · por {e.authorName}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap justify-end gap-1">
        <Badge variant={e.ownedByCommunity ? 'default' : 'secondary'}>
          {e.ownedByCommunity ? 'Da casa' : 'Catálogo'}
        </Badge>
        {e.video && (
          <Badge variant="outline" className="gap-1">
            <Video className="h-3 w-3" aria-hidden />
            Vídeo
          </Badge>
        )}
        {e.photos.length > 0 && (
          <Badge variant="outline" className="gap-1">
            <ImageIcon className="h-3 w-3" aria-hidden />
            {e.photos.length}
          </Badge>
        )}
      </span>
    </Link>
  );
}

function EquipmentCard({
  groupId,
  canEdit,
  equipment,
}: {
  groupId: string;
  canEdit: boolean;
  equipment: string[];
}) {
  const qc = useQueryClient();
  const [marcados, setMarcados] = useState(new Set(equipment));
  // Ajuste durante o render, e não num efeito (#187): salvar devolve a lista
  // nova, e o que está marcado acompanha.
  const [salvo, setSalvo] = useState(equipment);
  if (salvo !== equipment) {
    setSalvo(equipment);
    setMarcados(new Set(equipment));
  }
  const mudou = marcados.size !== equipment.length || equipment.some((e) => !marcados.has(e));

  const salvar = useMutation({
    mutationFn: () => groupExerciseApi.setEquipment(groupId, [...marcados]),
    onSuccess: () => {
      toast('Equipamento salvo.');
      void qc.invalidateQueries({ queryKey: orgKeys.exercises(groupId) });
    },
    onError: () => toast('Não deu para salvar agora.'),
  });

  return (
    <fieldset
      disabled={!canEdit}
      aria-label="Equipamento da academia"
      className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
    >
      <div>
        <p className="text-sm font-semibold">Equipamento da academia</p>
        <p className="text-xs text-muted-foreground">
          {canEdit
            ? 'O filtro "Na minha academia" mostra o que dá para fazer com isto. Peso corporal vale sempre.'
            : 'Só o dono muda. O filtro "Na minha academia" usa esta lista.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {GYM_EQUIPMENT.map((e) => (
          <label
            key={e}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-subtle px-3 py-1.5 text-xs font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary has-[:disabled]:cursor-default has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={marcados.has(e)}
              onChange={(ev) => {
                const proximo = new Set(marcados);
                if (ev.target.checked) proximo.add(e);
                else proximo.delete(e);
                setMarcados(proximo);
              }}
            />
            {EQUIPMENT_LABEL[e]}
          </label>
        ))}
      </div>
      {canEdit && (
        <Button size="sm" disabled={!mudou || salvar.isPending} onClick={() => salvar.mutate()}>
          Salvar equipamento
        </Button>
      )}
    </fieldset>
  );
}

/** Busca no catálogo geral para gravar o tutorial da comunidade por cima. */
function CatalogPicker({
  open,
  onOpenChange,
  existing,
  base,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: Set<number>;
  base: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [termo, setTermo] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTermo(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const busca = useQuery({
    queryKey: ['workout', 'exercises', termo, 'catalog-picker'],
    queryFn: () => workoutApi.searchExercises(termo || undefined),
    enabled: open,
  });
  // Só o catálogo geral: o exercício pessoal de quem está no painel não é da comunidade.
  const itens = busca.data?.filter((e) => e.createdByUserId === null && !e.groupOwned);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escolha o exercício</DialogTitle>
          <DialogDescription>
            O vídeo, as fotos e as dicas da equipe aparecem para os membros no lugar do vídeo
            padrão.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            aria-label="Buscar no catálogo"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ex.: supino, agachamento…"
            className="pl-9"
          />
        </div>
        <ul className="max-h-80 divide-y overflow-y-auto" aria-label="Exercícios do catálogo">
          {itens?.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-1 py-2.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onOpenChange(false);
                  router.push(existing.has(e.id) ? `${base}/${e.id}` : `${base}/${e.id}?catalog=1`);
                }}
              >
                <span>
                  <span className="block font-medium">{e.name}</span>
                  <span className="block text-xs capitalize text-muted-foreground">
                    {[e.muscleGroup, e.equipment].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {existing.has(e.id) && <Badge variant="secondary">Já tem tutorial</Badge>}
              </button>
            </li>
          ))}
          {itens?.length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">Nenhum exercício encontrado.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
