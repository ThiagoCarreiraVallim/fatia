'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dumbbell,
  HeartPulse,
  House,
  LayoutGrid,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import {
  ApiError,
  catalogGuideLabel,
  equipmentLabel,
  groupCan,
  groupExerciseApi,
  MUSCLE_GROUP_LABEL,
  MUSCLE_GROUPS,
  type CatalogFilters,
  type CatalogItem,
  type CatalogPage,
  type GymEquipmentState,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { ListError } from '@/components/content/content-ui';
import { GuidePanel } from '@/components/org/exercise-guide-panel';
import { GymEquipmentDialog } from '@/components/org/gym-equipment-dialog';
import { useOrgGroup } from '@/components/org/org-shell';
import { CountTabs, PanelPageHead, PanelTable } from '@/components/org/panel-bits';
import { useOptionalSidePanel, type SidePanelContent } from '@/components/org/side-panel';
import { EquipmentSummary } from '@/components/workout/equipment-chooser';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const PAGE = 60;
type View = 'grid' | 'list';

const muscleLabel = (m: string) =>
  (MUSCLE_GROUP_LABEL as Record<string, string>)[m] ?? m.charAt(0).toUpperCase() + m.slice(1);

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : fallback;
}

/**
 * O catálogo de exercícios da comunidade (Pn-11, #408): o catálogo geral e os
 * da casa, com busca, filtros, a estrela do favorito da equipe e o guia da
 * casa no painel lateral.
 */
export default function OrgExercisesPage() {
  const g = useOrgGroup();
  const router = useRouter();
  const qc = useQueryClient();
  const panel = useOptionalSidePanel();
  const [inline, setInline] = useState<SidePanelContent | null>(null);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equipment, setEquipment] = useState('');
  const [house, setHouse] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [view, setView] = useState<View>('grid');
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const filters: CatalogFilters = {
    ...(q ? { q } : {}),
    ...(muscle ? { muscle } : {}),
    ...(equipment ? { equipment } : {}),
    ...(house ? { house } : {}),
    ...(favorite ? { favorite } : {}),
    limit,
  };
  const list = useQuery({
    queryKey: [...orgKeys.exercises(g.id), 'catalog', filters],
    queryFn: () => groupExerciseApi.list(g.id, filters),
    placeholderData: keepPreviousData,
  });
  const base = `/org/${g.id}/exercises`;

  const star = useMutation({
    mutationFn: (v: { exerciseId: number; favorite: boolean }) =>
      groupExerciseApi.setFavorite(g.id, v.exerciseId, v.favorite),
    onSuccess: (_r, v) => {
      toast(
        v.favorite
          ? 'Favorito da equipe: aparece primeiro ao montar planos.'
          : 'Saiu dos favoritos.',
      );
      void qc.invalidateQueries({ queryKey: orgKeys.exercises(g.id) });
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para mudar agora.')),
  });
  const toggleStar = (i: CatalogItem) =>
    star.mutate({ exerciseId: i.exerciseId, favorite: !i.favorite });

  const close = () => {
    setOpenId(null);
    if (panel) panel.close();
    else setInline(null);
  };
  const openGuide = (i: CatalogItem) => {
    setOpenId(i.exerciseId);
    const c: SidePanelContent = {
      title: i.name,
      subtitle: 'Guia da casa · quem treina aqui vê primeiro',
      body: (
        <GuidePanel
          key={i.exerciseId}
          groupId={g.id}
          exerciseId={i.exerciseId}
          editHref={`${base}/${i.exerciseId}`}
          onDone={close}
        />
      ),
    };
    if (panel) panel.open(c);
    else setInline(c);
  };
  // O painel fechado pelo "»" também tira o destaque do cartão.
  const highlighted = (panel ? panel.content : inline) ? openId : null;

  const data = list.data;
  const muscles = data ? muscleTabs(data, muscle) : [];
  const equipmentOptions = data ? Object.entries(data.facets.equipment) : [];
  const filtering = Boolean(q || muscle || equipment || house || favorite);

  return (
    <div className="space-y-4">
      <PanelPageHead
        title="Exercícios"
        subtitle="Quem treina aqui vê estes primeiro, com o vídeo, as fotos e as dicas da equipe."
        action={
          <Button size="sm" className="gap-1.5" onClick={() => router.push(`${base}/new`)}>
            <Plus size={16} aria-hidden /> Novo exercício
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-60 sm:max-w-[260px]">
          <span className="sr-only">Buscar exercício</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Buscar exercício"
            className="h-[34px] w-full rounded-[10px] border border-border bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <CountTabs<string>
          label="Grupo muscular"
          value={muscle}
          onChange={(m) => {
            setMuscle(m);
            setLimit(PAGE);
          }}
          tabs={[{ key: '', label: 'Todos' }, ...muscles]}
        />
        <span className="relative inline-flex h-[34px] items-center gap-1.5 rounded-[10px] border border-border bg-card pl-3 pr-2 text-[13px] font-semibold">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden />
          <select
            aria-label="Equipamento"
            value={equipment}
            onChange={(e) => {
              setEquipment(e.target.value);
              setLimit(PAGE);
            }}
            className="h-full cursor-pointer appearance-none bg-transparent pr-1 outline-none"
          >
            <option value="">Equipamento · todos</option>
            {equipmentOptions.map(([key, n]) => (
              <option key={key} value={key}>
                {`${equipmentLabel(key)} (${n})`}
              </option>
            ))}
          </select>
        </span>
        <ToggleChip
          pressed={house}
          onClick={() => {
            setHouse(!house);
            setLimit(PAGE);
          }}
          icon={<House className="h-4 w-4" aria-hidden />}
          label="Da casa"
        />
        <ToggleChip
          pressed={favorite}
          onClick={() => {
            setFavorite(!favorite);
            setLimit(PAGE);
          }}
          icon={<Star className={cn('h-4 w-4', favorite && 'fill-current')} aria-hidden />}
          label="Favoritos"
        />
        <div className="ml-auto flex rounded-[10px] border border-border bg-card p-[3px]">
          <ViewButton active={view === 'grid'} label="Ver em grade" onClick={() => setView('grid')}>
            <LayoutGrid className="h-4 w-4" aria-hidden />
          </ViewButton>
          <ViewButton active={view === 'list'} label="Ver em lista" onClick={() => setView('list')}>
            <List className="h-4 w-4" aria-hidden />
          </ViewButton>
        </div>
      </div>

      {inline && (
        <section
          aria-label={inline.title}
          className="overflow-hidden rounded-2xl border border-subtle bg-background"
        >
          <div className="border-b border-subtle px-4 py-3">
            <h2 className="text-sm font-semibold">{inline.title}</h2>
            {inline.subtitle && <p className="text-xs text-muted-foreground">{inline.subtitle}</p>}
          </div>
          {inline.body}
        </section>
      )}

      {list.isPending ? (
        <Skeleton className="h-64 rounded-2xl bg-card" />
      ) : list.isError || !data ? (
        <ListError
          title="Não deu para carregar os exercícios"
          onRetry={() => void list.refetch()}
        />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title={filtering ? 'Nenhum exercício com esses filtros' : 'Nenhum exercício ainda'}
          description={
            filtering
              ? 'Tire um filtro ou busque por outro nome.'
              : 'Crie os exercícios da casa; os do catálogo geral aparecem aqui também.'
          }
        />
      ) : view === 'grid' ? (
        <ul
          aria-label="Exercícios do catálogo"
          className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3"
        >
          {data.items.map((i) => (
            <li key={i.exerciseId}>
              <ExerciseCard
                item={i}
                selected={highlighted === i.exerciseId}
                onOpen={() => openGuide(i)}
                onStar={() => toggleStar(i)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <PanelTable
          label="Exercícios do catálogo"
          head={['Exercício', 'Músculo', 'Equipamento', 'Guia', 'Favorito']}
        >
          {data.items.map((i) => (
            <tr key={i.exerciseId} className={cn(highlighted === i.exerciseId && 'bg-muted/60')}>
              <td className="px-3 py-2">
                <button
                  type="button"
                  aria-label={`Abrir ${i.name}`}
                  onClick={() => openGuide(i)}
                  className="flex items-center gap-2 text-left font-semibold hover:underline"
                >
                  {i.name}
                  {i.homeFriendly && <HouseBadge />}
                </button>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{muscleLabel(i.muscleGroup)}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {i.equipment ? equipmentLabel(i.equipment) : '—'}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{catalogGuideLabel(i)}</td>
              <td className="px-3 py-1">
                <StarButton item={i} onClick={() => toggleStar(i)} />
              </td>
            </tr>
          ))}
        </PanelTable>
      )}

      {data && data.items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {`${data.count} de ${data.total} exercícios · a estrela marca os favoritos da equipe: aparecem primeiro ao montar planos.`}
          </p>
          {data.items.length < data.count && (
            <Button size="sm" variant="outline" onClick={() => setLimit(limit + PAGE)}>
              Mostrar mais
            </Button>
          )}
        </div>
      )}

      {/* Depois da lista, como no app: é o que se mexe uma vez e se consulta pouco. */}
      {data && <EquipmentCard groupId={g.id} canEdit={groupCan(g, 'group.update')} saved={data} />}
    </div>
  );
}

/** As abas de músculo com a contagem do catálogo (a faceta ignora o próprio filtro). */
function muscleTabs(data: CatalogPage, current: string) {
  const counts = data.facets.muscles;
  const known: string[] = [...MUSCLE_GROUPS];
  const keys = [
    ...known.filter((m) => counts[m] || m === current),
    ...Object.keys(counts).filter((m) => !known.includes(m)),
  ];
  return keys.map((m) => ({ key: m, label: muscleLabel(m), count: counts[m] ?? 0 }));
}

function ToggleChip({
  pressed,
  onClick,
  icon,
  label,
}: {
  pressed: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex h-[34px] items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-semibold',
        pressed
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ViewButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-[28px] w-9 items-center justify-center rounded-[7px]',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function HouseBadge() {
  return (
    <span
      title="Dá para fazer em casa"
      className="inline-flex h-5 shrink-0 items-center rounded-full bg-[hsl(var(--warning))] px-2 text-[10px] font-bold tracking-wide text-black"
    >
      DA CASA
    </span>
  );
}

function StarButton({ item, onClick }: { item: CatalogItem; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={item.favorite}
      aria-label={item.favorite ? `Tirar ${item.name} dos favoritos` : `Favoritar ${item.name}`}
      onClick={onClick}
      className={cn(
        'relative flex h-8 w-8 items-center justify-center rounded-lg bg-background/70 backdrop-blur after:absolute after:-inset-1.5 hover:bg-background',
        item.favorite ? 'text-[hsl(var(--warning))]' : 'text-muted-foreground',
      )}
    >
      <Star className={cn('h-4 w-4', item.favorite && 'fill-current')} aria-hidden />
    </button>
  );
}

function ExerciseCard({
  item: i,
  selected,
  onOpen,
  onStar,
}: {
  item: CatalogItem;
  selected: boolean;
  onOpen: () => void;
  onStar: () => void;
}) {
  const Icon = i.muscleGroup === 'cardio' ? HeartPulse : Dumbbell;
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-card transition-colors',
        selected ? 'border-primary' : 'border-subtle hover:border-primary/40',
      )}
    >
      <button
        type="button"
        aria-label={`Abrir ${i.name}`}
        onClick={onOpen}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex h-24 items-center justify-center bg-muted/60 text-muted-foreground">
          <Icon className="h-7 w-7" aria-hidden />
        </span>
        <span className="block space-y-0.5 px-3 py-2.5">
          <span className="block truncate text-sm font-semibold">{i.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {[muscleLabel(i.muscleGroup), i.equipment ? equipmentLabel(i.equipment) : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </button>
      {i.homeFriendly && (
        <span className="absolute left-2 top-2">
          <HouseBadge />
        </span>
      )}
      <span className="absolute right-2 top-2">
        <StarButton item={i} onClick={onStar} />
      </span>
    </div>
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
              : 'Só o dono e o admin mudam. O filtro "Na minha academia" usa esta lista.'}
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
