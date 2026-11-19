'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** O que abre no painel lateral: comunicado, ficha, formulário (#398). */
export interface SidePanelContent {
  title: string;
  subtitle?: string;
  body: ReactNode;
}

interface SidePanelApi {
  content: SidePanelContent | null;
  open: (c: SidePanelContent) => void;
  close: () => void;
}

const Ctx = createContext<SidePanelApi | null>(null);

/** Abre e fecha o painel lateral do painel da equipe. */
export function useSidePanel(): SidePanelApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSidePanel fora do painel');
  return c;
}

/** O mesmo, mas nulo fora do painel (a tela cai no formulário em linha). */
export function useOptionalSidePanel(): SidePanelApi | null {
  return useContext(Ctx);
}

export function SidePanelProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<SidePanelContent | null>(null);
  const close = useCallback(() => setContent(null), []);
  const api = useMemo(() => ({ content, open: setContent, close }), [content, close]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/**
 * O painel lateral (Pn-01b): no computador abre à direita e **empurra** a
 * página (ela encolhe, nada fica por baixo); no celular ocupa a tela, acima da
 * barra de abas, para os botões do pé nunca ficarem cobertos. Fecha com esc.
 */
export function SidePanel() {
  const { content, close } = useSidePanel();
  const aberto = content !== null;

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aberto, close]);

  return (
    <aside
      aria-hidden={!aberto}
      aria-label={content?.title}
      className={cn(
        'flex flex-col overflow-hidden bg-background',
        // Celular: tela cheia, acima da barra de abas (z-40).
        'fixed inset-0 z-50 pt-[env(safe-area-inset-top)] md:static md:z-auto md:pt-0',
        'md:shrink-0 md:rounded-2xl md:shadow-[0_0_0_1px_hsl(var(--border))] md:transition-[width,margin,opacity] md:duration-300',
        aberto
          ? 'md:ml-2 md:w-[440px] md:opacity-100'
          : 'hidden md:flex md:w-0 md:opacity-0 md:shadow-none',
      )}
    >
      {content && (
        <>
          <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border pl-4 pr-2.5">
            <span className="min-w-0 flex-1">
              <b className="block truncate text-sm font-semibold">{content.title}</b>
              {content.subtitle && (
                <span className="block truncate text-xs text-muted-foreground">
                  {content.subtitle}
                </span>
              )}
            </span>
            <button
              type="button"
              aria-label="Fechar painel"
              onClick={close}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronsRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col md:w-[440px]">{content.body}</div>
        </>
      )}
    </aside>
  );
}
