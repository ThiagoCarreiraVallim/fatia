'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  searchTutorials,
  tutorialById,
  tutorialsApi,
  tutorialSubtitle,
  type Tutorial,
} from '@fatia/api-client';
import { Badge } from '@/components/ui/badge';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { useOnline } from './use-online';

const SEEN_KEY = ['you', 'tutorials', 'seen'] as const;

/**
 * Ajuda e tutoriais (pranchas Al-V12/V12b). O texto vem no pacote, então a
 * ajuda funciona sem internet; só o vídeo some, com o aviso. "assistido" é o
 * que a pessoa já abriu, guardado na API. `initialTutorialId` (o `?tutorial=`
 * da rota) abre um tutorial direto, como o "Ver o tutorial" de Conectar sua IA:
 * pelo mesmo `openTutorial` do toque na lista (marca como assistido), e fechar
 * tira o parâmetro da URL, para voltar ou recarregar não reabrir.
 */
export function HelpScreen({ initialTutorialId }: { initialTutorialId?: string } = {}) {
  const online = useOnline();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const router = useRouter();
  const [open, setOpen] = useState<Tutorial | null>(() => tutorialById(initialTutorialId));
  /** O tutorial aberto veio do `?tutorial=` e o parâmetro ainda está na URL. */
  const fromUrl = useRef(open !== null);

  const seen = useQuery({
    queryKey: SEEN_KEY,
    queryFn: () => tutorialsApi.seen(),
    retry: false,
  });
  const markSeen = useMutation({
    mutationFn: (id: string) => tutorialsApi.markSeen(id),
    onSuccess: (data) => qc.setQueryData(SEEN_KEY, data),
  });
  const seenIds = new Set(seen.data?.seen ?? []);
  const areas = searchTutorials(query);

  /** O mesmo para o toque na lista e para o `?tutorial=`. */
  const markSeenIfNew = (t: Tutorial) => {
    if (online && !seenIds.has(t.id)) markSeen.mutate(t.id);
  };
  const openTutorial = (t: Tutorial) => {
    setOpen(t);
    markSeenIfNew(t);
  };

  const closeTutorial = () => {
    setOpen(null);
    if (fromUrl.current) {
      fromUrl.current = false;
      router.replace('/you/help', { scroll: false });
    }
  };

  // Só na montagem: o tutorial do `?tutorial=` já abriu no estado inicial; aqui
  // ele é marcado como assistido. O ref segura o duplo efeito do StrictMode.
  const markedInitial = useRef(false);
  useEffect(() => {
    if (markedInitial.current) return;
    markedInitial.current = true;
    const initial = tutorialById(initialTutorialId);
    if (initial) markSeenIfNew(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-3.5 px-6 pb-8 pt-4">
      {!online && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-field bg-[hsl(var(--warning)/0.12)] p-3"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[hsl(var(--warning)/0.18)] text-warning">
            <Icon name="alert" size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-sm text-foreground">Sem conexão</b>
            <span className="text-[13px] text-muted-foreground">
              Os vídeos voltam quando a internet voltar. Os textos estão salvos.
            </span>
          </span>
        </div>
      )}

      <label className="flex h-12 items-center gap-2 rounded-field bg-card px-3.5">
        <Icon name="search" size={16} className="text-faint" />
        <input
          type="search"
          aria-label="Buscar ajuda"
          placeholder="Buscar: foto do prato, metas, comunidade…"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-faint"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <Link
        href="/onboarding?next=/you/help"
        className="flex items-center gap-3 rounded-card bg-card p-3.5 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.35)]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary/15 text-primary">
          <Icon name="repeat" size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] text-foreground">Repetir primeiros passos</b>
          <span className="text-[13px] text-muted-foreground">O guia do começo, de novo</span>
        </span>
        <Icon name="chevR" size={16} className="text-faint" />
      </Link>

      {areas.length === 0 && (
        <p className="py-6 text-center text-[15px] text-muted-foreground">
          Nada encontrado para “{query.trim()}”.
        </p>
      )}

      {areas.map((area) => (
        <section key={area.title} aria-label={area.title} className="flex flex-col gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {area.title}
          </h2>
          <ul className="divide-y divide-subtle overflow-hidden rounded-card bg-card">
            {area.items.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openTutorial(t)}
                  className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-3"
                >
                  <span className="flex h-9 w-[52px] shrink-0 items-center justify-center rounded-[10px] bg-muted text-muted-foreground">
                    <Icon name={t.videoUrl && online ? 'play' : 'file'} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold text-foreground">
                      {t.title}
                    </span>
                    <span className="block text-[13px] text-muted-foreground">
                      {tutorialSubtitle(t, online)}
                    </span>
                  </span>
                  {seenIds.has(t.id) && (
                    <Badge variant="done" className="h-5 text-[10px]">
                      assistido
                    </Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Drawer open={open !== null} onOpenChange={(o) => !o && closeTutorial()}>
        <DrawerContent className="px-6 pb-8">
          {open && (
            <>
              <DrawerHeader className="px-0">
                <DrawerTitle className="font-display text-xl font-bold">{open.title}</DrawerTitle>
                <DrawerDescription>{tutorialSubtitle(open, online)}</DrawerDescription>
              </DrawerHeader>
              {open.videoUrl && online && (
                <video
                  src={open.videoUrl}
                  controls
                  playsInline
                  className="mb-3 aspect-video w-full rounded-field bg-black"
                />
              )}
              <div className="flex flex-col gap-3 text-[15px] text-foreground">
                {open.body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
