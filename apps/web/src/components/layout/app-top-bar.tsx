'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { hasTopBar, routeInfo } from '@fatia/api-client';
import { headerButtonClass } from './tab-header';

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

/**
 * Botão-ícone de ação na barra: o `.ib` do canvas, igual ao "voltar" (44 × 44,
 * cantos 14 px, fundo `--s1`). Para o verde de criar, `headerButtonClass('lime')`.
 */
export const topBarActionClass = headerButtonClass();

/** Ações da tela, à direita na barra. Fora do provider não renderiza nada. */
export function TopBarActions({ children }: { children: ReactNode }) {
  const slot = useTopBarContext()?.slot;
  return slot ? createPortal(children, slot) : null;
}

/**
 * A barra das telas empurradas (pranchas Al-V2, Al-N7): "voltar" num quadrado
 * de cantos arredondados à esquerda, o título (Sora 17/600) no meio e as ações
 * à direita. As abas não têm barra (`hasTopBar`): abrem com o `TabHeader` da
 * própria tela. Exceção: aba que pede título (`useTopBarTitle`, ex.: o treino
 * em andamento em `/workout`) ganha a barra, com o título à esquerda.
 *
 * `wide`: a coluna do painel da comunidade, mais larga que a do app no desktop.
 */
export function AppTopBar({ wide = false }: { wide?: boolean }) {
  const pathname = usePathname();
  const ctx = useTopBarContext();
  const info = routeInfo(pathname);
  if (!hasTopBar(pathname) && !ctx?.title) return null;
  const parent = info.parent;
  const title = ctx?.title ?? info.title;
  const label = `Voltar para ${info.parentTitle ?? ''}`;

  return (
    <header className="sticky top-0 z-40 -mt-[env(safe-area-inset-top)] bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div
        className={`mx-auto flex h-14 w-full items-center gap-3 px-4 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}
      >
        {parent !== null && (
          <Link
            href={parent}
            aria-label={label}
            className={headerButtonClass()}
            onClick={(e) => {
              const intercept = ctx?.back;
              if (intercept) {
                e.preventDefault();
                intercept();
              }
            }}
          >
            <ChevronLeft size={22} aria-hidden />
          </Link>
        )}
        <h1
          className={`min-w-0 flex-1 truncate font-display text-[17px] font-semibold text-foreground ${parent !== null ? 'text-center' : ''}`}
        >
          {title}
        </h1>
        {/* Sem ações, um vazio do tamanho do "voltar" mantém o título no centro. */}
        <div
          ref={ctx?.setSlot}
          className={`flex shrink-0 items-center gap-2 ${parent !== null ? 'empty:w-11' : ''}`}
        />
      </div>
    </header>
  );
}
