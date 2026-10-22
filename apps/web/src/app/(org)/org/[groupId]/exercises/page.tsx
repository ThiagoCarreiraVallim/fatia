'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Dumbbell, Image as ImageIcon, Plus, Search, Video } from 'lucide-react';
import {
  groupExerciseApi,
  workoutApi,
  type GroupExercise,
  type GymEquipmentState,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import {
  DrawerOption,
  ListError,
  NewButton,
  RowChevron,
  SectionHeader,
} from '@/components/content/content-ui';
import { GymEquipmentDialog } from '@/components/org/gym-equipment-dialog';
import { useOrgGroup } from '@/components/org/org-shell';
import { EquipmentSummary } from '@/components/workout/equipment-chooser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
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
  const router = useRouter();
  const [choosingKind, setChoosingKind] = useState(false);
  const [pickingCatalog, setPickingCatalog] = useState(false);
  const list = useQuery({
    queryKey: orgKeys.exercises(g.id),
    queryFn: () => groupExerciseApi.list(g.id),
  });
  const base = `/org/${g.id}/exercises`;
  const openNew = () => setChoosingKind(true);

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Quem treina em {g.name} vê estes exercícios primeiro, com o vídeo, as fotos e as dicas da
        equipe no lugar do vídeo padrão.
      </p>

      {/* Criar no cabeçalho da lista, com a escolha num drawer: os dois botões
          de antes ("Exercício da casa" e "Tutorial para um exercício do
          catálogo") eram longos, de pesos diferentes e não diziam que criavam. */}
      <SectionHeader
        title="Exercícios"
        count={list.data?.items.length}
        action={<NewButton label="Novo exercício" onClick={openNew} />}
      />

      {list.isPending ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : list.isError ? (
        <ListError
          title="Não deu para carregar os exercícios"
          onRetry={() => void list.refetch()}
        />
      ) : list.data.items.length ? (
        <ul className="space-y-2" aria-label="Exercícios da comunidade">
          {list.data.items.map((e) => (
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
          action={<NewButton label="Novo exercício" onClick={openNew} />}
        />
      )}

      {/* Depois da lista, como no app: é o que se mexe uma vez e se consulta pouco. */}
      {list.data && <EquipmentCard groupId={g.id} canEdit={g.role === 'OWNER'} saved={list.data} />}

      <Drawer open={choosingKind} onOpenChange={setChoosingKind}>
        <DrawerContent className="px-4 pb-6">
          <DrawerHeader className="px-0">
            <DrawerTitle>Novo exercício</DrawerTitle>
            <DrawerDescription>Quem treina na comunidade vê estes primeiro.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-2 pt-4">
            <DrawerOption
              icon={Plus}
              title="Exercício da casa"
              description="Do zero: nome, grupo muscular, passos, vídeo e fotos."
              onClick={() => {
                setChoosingKind(false);
                router.push(`${base}/new`);
              }}
            />
            <DrawerOption
              icon={BookOpen}
              title="Tutorial de um exercício do catálogo"
              description="O exercício já existe; a equipe grava o vídeo, as fotos e as dicas."
              onClick={() => {
                setChoosingKind(false);
                setPickingCatalog(true);
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>

      <CatalogPicker
        open={pickingCatalog}
        onOpenChange={setPickingCatalog}
        existing={new Set(list.data?.items.map((e) => e.exerciseId) ?? [])}
        base={base}
      />
    </div>
  );
}

function ExerciseRow({ exercise: e, href }: { exercise: GroupExercise; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-subtle bg-card p-3 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block truncate text-sm font-semibold">{e.name}</span>
        <span className="block text-xs capitalize text-muted-foreground">
          {[e.muscleGroup, e.equipment].filter(Boolean).join(' · ')} · por {e.authorName}
        </span>
      </span>
      {/* Selos de contorno: o "Da casa" verde e cheio tinha cara de botão. */}
      <span className="flex shrink-0 flex-wrap justify-end gap-1">
        <Badge variant="outline">{e.ownedByCommunity ? 'Da casa' : 'Catálogo'}</Badge>
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
      <RowChevron />
    </Link>
  );
}

/**
 * O resumo do equipamento na tela; a lista inteira, com busca e os próprios
 * da academia, abre no modal (`GymEquipmentDialog`).
 */
function EquipmentCard({
  groupId,
  canEdit,
  saved,
}: {
  groupId: string;
  canEdit: boolean;
  saved: GymEquipmentState;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-label="Equipamento da academia"
      className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Equipamento da academia</h2>
          <p className="text-xs text-muted-foreground">
            {canEdit
              ? 'O filtro "Na minha academia" mostra o que dá para fazer com isto. Peso corporal vale sempre.'
              : 'Só o dono muda. O filtro "Na minha academia" usa esta lista.'}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {canEdit ? 'Editar equipamento' : 'Ver equipamento'}
        </Button>
      </div>
      <EquipmentSummary equipment={saved.equipment} custom={saved.customEquipment} />
      <GymEquipmentDialog
        groupId={groupId}
        canEdit={canEdit}
        saved={saved}
        open={open}
        onOpenChange={setOpen}
      />
    </section>
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
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const search = useQuery({
    queryKey: ['workout', 'exercises', term, 'catalog-picker'],
    queryFn: () => workoutApi.searchExercises(term || undefined),
    enabled: open,
  });
  // Só o catálogo geral: o exercício pessoal de quem está no painel não é da comunidade.
  const items = search.data?.filter((e) => e.createdByUserId === null && !e.groupOwned);

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
          {items?.map((e) => (
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
          {(search.isFetching || items?.length === 0) && (
            <li className="py-3 text-sm text-muted-foreground">
              {search.isFetching ? 'Buscando…' : 'Nenhum exercício do catálogo com esse nome.'}
            </li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
