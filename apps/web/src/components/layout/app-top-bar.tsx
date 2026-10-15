'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { routeInfo } from '@fatia/api-client';

/**
 * Barra de topo como no iOS: "voltar" e o título pequeno de onde a pessoa está.
 * Some no Início, que é a raiz. Voltar sobe pelo mapa de rotas
 * (`routeInfo`, api-client), não pelo histórico: um link aberto direto também
 * volta pelo caminho certo até o Início.
 *
 * A tela fala com a barra por três peças, todas opcionais:
 * - `useTopBarTitle(nome)`: troca o título genérico pelo nome real
 *   (plano, conversa, comunidade);
 * - `<TopBarActions>`: botões à direita (Copiar dia, Histórico…), por portal;
 * - `useTopBarBack(fn)`: intercepta o voltar (treino em andamento confirma).
 */

interface TopBarState {
  title: string | null;
  setTitle: (t: string | null) => void;
  back: (() => void) | null;
  setBack: (fn: (() => void) | null) => void;
  slot: HTMLDivElement | null;
  setSlot: (el: HTMLDivElement | null) => void;
}

const TopBarContext = createContext<TopBarState | null>(null);

export function TopBarProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [back, setBack] = useState<(() => void) | null>(null);
  return (
    <TopBarContext.Provider value={{ title, setTitle, back, setBack, slot, setSlot }}>
      {children}
    </TopBarContext.Provider>
  );
}

function useTopBarContext(): TopBarState | null {
  return useContext(TopBarContext);
}

/** O nome real da tela dinâmica. `undefined`/vazio mantém o título do mapa. */
export function useTopBarTitle(title: string | null | undefined) {
  const ctx = useTopBarContext();
  const setTitle = ctx?.setTitle;
  useEffect(() => {
    if (!setTitle) return;
    setTitle(title || null);
    return () => setTitle(null);
  }, [setTitle, title]);
}

/** Intercepta o "voltar" enquanto a tela estiver montada. Passe uma função estável. */
export function useTopBarBack(onBack: (() => void) | null) {
  const setBack = useTopBarContext()?.setBack;
  useEffect(() => {
    if (!setBack) return;
    // Função no `setState` é atualizador; embrulhada, vira o valor guardado.
    setBack(() => onBack);
    return () => setBack(null);
  }, [setBack, onBack]);
}

/** Botão-ícone de ação na barra: mesmo alvo e cor do "voltar". */
export const topBarActionClass =
  'flex h-11 w-11 items-center justify-center rounded-full text-primary transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40';

/** Ações da tela, à direita na barra. Fora do provider não renderiza nada. */
export function TopBarActions({ children }: { children: ReactNode }) {
  const slot = useTopBarContext()?.slot;
  return slot ? createPortal(children, slot) : null;
}

export function AppTopBar() {
  const pathname = usePathname();
  const ctx = useTopBarContext();
  const info = routeInfo(pathname);
  if (info.parent === null) return null;
  const title = ctx?.title ?? info.title;
  const label = `Voltar para ${info.parentTitle}`;
  const backClass =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <header className="sticky top-0 z-40 -mt-[env(safe-area-inset-top)] border-b border-subtle bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-1 px-2">
        <Link
          href={info.parent}
          aria-label={label}
          className={backClass}
          onClick={(e) => {
            const intercept = ctx?.back;
            if (intercept) {
              e.preventDefault();
              intercept();
            }
          }}
        >
          <ChevronLeft size={26} aria-hidden />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold text-foreground">
          {title}
        </h1>
        <div ref={ctx?.setSlot} className="flex shrink-0 items-center gap-1 pe-1" />
      </div>
    </header>
  );
}
