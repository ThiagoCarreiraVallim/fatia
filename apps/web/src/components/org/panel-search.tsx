'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowUpRight, LayoutGrid, NotebookText, Search } from 'lucide-react';
import {
  panelApi,
  pushRecent,
  searchEntries,
  teamRoleLabel,
  type MyGroup,
  type SearchEntry,
} from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { orgKeys } from '@/components/community/query-keys';
import { readRecents, writeRecents, type RecentEntry } from './panel-prefs';

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

function useDebounced(value: string, ms = 150): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Linha({
  item,
  active,
  onPick,
  onHover,
}: {
  item: SearchEntry;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
}) {
  return (
    <li role="option" aria-selected={active} id={`busca-${item.id}`}>
      <button
        type="button"
        onClick={onPick}
        onMouseMove={onHover}
        className={cn(
          'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm',
          active ? 'bg-muted' : 'hover:bg-muted/60',
        )}
      >
        {item.kind === 'member' ? (
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold"
          >
            {iniciais(item.title)}
          </span>
        ) : (
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground"
          >
            {item.kind === 'screen' ? (
              <LayoutGrid className="h-4 w-4" />
            ) : (
              <NotebookText className="h-4 w-4" />
            )}
          </span>
        )}
        <b className="min-w-0 truncate font-semibold">{item.title}</b>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{item.subtitle}</span>
        <ArrowUpRight aria-hidden className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}

/**
 * A busca ⌘K do painel (Pn2-00): membros pelo nome, telas e planos da
 * biblioteca, agrupados. A API filtra pelo papel e nunca devolve dado de
 * saúde; "Recentes" fica no navegador, por pessoa e comunidade.
 */
export function PanelSearch({
  group,
  open,
  onOpenChange,
}: {
  group: MyGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[max(env(safe-area-inset-top),12vh)] z-50 flex max-h-[70vh] w-[calc(100%-32px)] max-w-[640px] -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-popover shadow-[0_0_0_1px_hsl(var(--border)),0_30px_60px_-20px_rgba(0,0,0,0.8)]"
        >
          <DialogPrimitive.Title className="sr-only">Buscar no painel</DialogPrimitive.Title>
          {/* Montado a cada abertura: começa vazio e relê os recentes. */}
          {open && <Busca group={group} onClose={() => onOpenChange(false)} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Busca({ group, onClose }: { group: MyGroup; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [ativo, setAtivo] = useState(0);
  const [recentes] = useState<RecentEntry[]>(() => readRecents(group.membershipId));
  const termo = useDebounced(q.trim());

  const busca = useQuery({
    queryKey: orgKeys.panelSearch(group.id, termo),
    queryFn: () => panelApi.search(group.id, termo),
    enabled: termo.length > 0,
    staleTime: 30_000,
  });

  const grupos = useMemo(() => {
    const brutos = termo
      ? busca.data
        ? searchEntries(group.id, busca.data)
        : []
      : recentes.length
        ? [{ group: 'Recentes', items: recentes }]
        : [];
    // O índice de cada linha na lista inteira, para ↑↓ atravessar os grupos.
    return brutos.map((g, i) => ({
      ...g,
      start: brutos.slice(0, i).reduce((n, x) => n + x.items.length, 0),
    }));
  }, [termo, busca.data, recentes, group.id]);
  const lista = grupos.flatMap((g) => g.items);
  const vazio = termo.length > 0 && busca.isSuccess && lista.length === 0;

  const abrir = (item: SearchEntry) => {
    writeRecents(group.membershipId, pushRecent(recentes, item));
    onClose();
    router.push(item.href);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAtivo((i) => Math.min(i + 1, Math.max(lista.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && lista[ativo]) {
      e.preventDefault();
      abrir(lista[ativo]);
    }
  };

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Search aria-hidden className="h-4 w-4 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setAtivo(0);
          }}
          onKeyDown={onKeyDown}
          maxLength={60}
          placeholder="Buscar membro, tela ou plano"
          aria-label="Buscar"
          role="combobox"
          aria-expanded={lista.length > 0}
          aria-controls="busca-resultados"
          aria-activedescendant={lista[ativo] ? `busca-${lista[ativo].id}` : undefined}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <kbd className="rounded-md px-1.5 text-[11px] font-bold text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]">
          esc
        </kbd>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" id="busca-resultados">
        {grupos.map((g) => (
          <section key={g.group} aria-label={g.group} className="pb-1">
            <p className="px-3 pb-1 pt-2 text-[11.5px] font-semibold text-muted-foreground">
              {g.group}
            </p>
            <ul role="listbox" aria-label={g.group}>
              {g.items.map((item, j) => (
                <Linha
                  key={item.id}
                  item={item}
                  active={g.start + j === ativo}
                  onPick={() => abrir(item)}
                  onHover={() => setAtivo(g.start + j)}
                />
              ))}
            </ul>
          </section>
        ))}
        {vazio && (
          <div className="px-3 py-8 text-center">
            <b className="block text-sm">Nada com “{termo}”</b>
            <span className="text-sm text-muted-foreground">
              Tente o nome de um membro, uma tela ou um plano.
            </span>
          </div>
        )}
        {busca.isError && (
          <p role="alert" className="px-3 py-6 text-center text-sm text-danger">
            Não deu para buscar agora. Tente de novo.
          </p>
        )}
        {!termo && grupos.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Digite o nome de um membro, uma tela ou um plano.
          </p>
        )}
      </div>

      <div className="hidden shrink-0 items-center gap-4 border-t border-border px-4 py-2.5 text-xs text-muted-foreground sm:flex">
        <span>↑↓ navegar</span>
        <span>↵ abrir</span>
        <span className="ml-auto">
          sem dado de saúde na busca · você é {teamRoleLabel(group.role).toLowerCase()}
        </span>
      </div>
    </>
  );
}
