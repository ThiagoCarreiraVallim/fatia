'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cssEasing, duration } from '@fatia/design';
import {
  AI_DRAWER_MANUAL_ITEMS,
  AI_MENU_DRAG_CLOSE_PX,
  AI_PRO_TEASER,
  aiMenuBackLabel,
  aiMenuFrame,
  aiMenuPlaceholder,
  completionHistory,
  conversationTimeLabel,
  drawerChipSection,
  drawerConversations,
  freeOfferCta,
  mealTypeForTime,
  nutritionApi,
  suggestionIcon,
  workoutApi,
  workoutQuickLabel,
  type AiDrawerManualKey,
  type MealType,
} from '@fatia/api-client';
import { Icon } from '@/components/ui/icon';
import { FoodSearchDrawer } from '@/components/nutrition/food-search-drawer';
import { LogStepsDrawer } from '@/components/progress/log-steps-drawer';
import { LogWaterDrawer } from '@/components/progress/log-water-drawer';
import { LogWeightDrawer } from '@/components/progress/log-weight-drawer';
import { queueFirstMessage } from '@/components/chat/drawer-message';
import { useDitado } from '@/components/chat/use-ditado';
import { hojeIso } from '@/lib/dias';
import { cn } from '@/lib/utils';
import { aiLocked, aiUsable, useChatAvailability, useDrawerConversations } from './use-ai-state';

type Target = 'water' | 'weight' | 'steps' | { meal: { date: string; mealType: MealType } };

interface AiMenuState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

interface AiMenuInternals extends AiMenuState {
  go: (href: string) => void;
  pick: (t: Target) => void;
  /** Rolagem e foco de quando o menu abriu: o fechar devolve os dois. */
  originRef: { current: { scrollY: number; focus: HTMLElement | null } };
}

const AiMenuContext = createContext<AiMenuInternals>({
  isOpen: false,
  open: () => undefined,
  close: () => undefined,
  go: () => undefined,
  pick: () => undefined,
  originRef: { current: { scrollY: 0, focus: null } },
});

/** Abre o menu da IA. Quem chama é o botão da IA da barra de baixo e o da lateral. */
export function useAiMenu(): AiMenuState {
  return useContext(AiMenuContext);
}

/** Marca da entrada no histórico que o menu aberto ocupa (o "voltar" fecha o menu). */
const HISTORY_MARK = 'fatiaAiDrawer';

/** Largura da `SideNav` no desktop (`w-64`): a tela que encolhe é a coluna ao lado. */
const SIDE_NAV_WIDTH = 256;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * O estado do menu "O que vamos registrar?" (ADR 040, pranchas `Al-H6c5` a
 * `Al-H6c9`). O menu só escolhe: quem registra são as folhas de sempre (busca
 * de comida, água, peso, passos), que este provider monta.
 *
 * O "voltar" do navegador fecha o menu: abrir empilha uma entrada no
 * histórico, e o `popstate` fecha. Quem desenha é o {@link AiMenuStage}.
 */
export function AiMenuProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const pushed = useRef(false);
  const originRef = useRef<{ scrollY: number; focus: HTMLElement | null }>({
    scrollY: 0,
    focus: null,
  });

  useEffect(() => {
    const onPop = () => {
      if (!pushed.current) return;
      pushed.current = false;
      setIsOpen(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const open = useCallback(() => {
    // Antes de a tela congelar: depois disso a página não tem mais rolagem.
    originRef.current = {
      scrollY: window.scrollY,
      focus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    };
    setIsOpen(true);
    if (!pushed.current) {
      pushed.current = true;
      window.history.pushState({ ...window.history.state, [HISTORY_MARK]: true }, '');
    }
  }, []);

  /** Fecha pelo voltar, pelo notch ou pelo Esc: desfaz a entrada que o abrir empilhou. */
  const close = useCallback(() => {
    setIsOpen(false);
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    }
  }, []);

  /**
   * Fecha indo para outra tela: a entrada do menu vira a tela de destino, em
   * vez de voltar e depois avançar (o que perderia a navegação na corrida).
   */
  const go = useCallback(
    (href: string) => {
      setIsOpen(false);
      if (pushed.current) {
        pushed.current = false;
        router.replace(href);
      } else {
        router.push(href);
      }
    },
    [router],
  );

  /** Fecha e abre uma das folhas de registro, por cima da tela onde a pessoa estava. */
  const pick = useCallback(
    (next: Target) => {
      close();
      setTarget(next);
    },
    [close],
  );

  const value = useMemo(
    () => ({ isOpen, open, close, go, pick, originRef }),
    [isOpen, open, close, go, pick],
  );
  const meal = typeof target === 'object' && target !== null ? target.meal : null;
  const closeTarget = () => setTarget(null);

  return (
    <AiMenuContext.Provider value={value}>
      {children}
      {meal && (
        <FoodSearchDrawer
          open
          onOpenChange={(o) => !o && closeTarget()}
          date={meal.date}
          mealType={meal.mealType}
        />
      )}
      <LogWaterDrawer open={target === 'water'} onClose={closeTarget} />
      <LogWeightDrawer open={target === 'weight'} onClose={closeTarget} />
      <LogStepsDrawer open={target === 'steps'} onClose={closeTarget} />
    </AiMenuContext.Provider>
  );
}

/** Tamanho da janela e da coluna do app (no desktop, à direita da `SideNav`). */
function useViewport(sideNav: boolean) {
  const read = () => {
    if (typeof window === 'undefined') return { left: 0, width: 390, height: 844, keyboard: 0 };
    const left = sideNav && window.matchMedia?.('(min-width: 768px)').matches ? SIDE_NAV_WIDTH : 0;
    const vv = window.visualViewport;
    // O teclado do celular encolhe só a viewport visual: a diferença é a altura dele.
    const keyboard = vv
      ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
      : 0;
    return { left, width: window.innerWidth - left, height: window.innerHeight, keyboard };
  };
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const update = () => setVp(read());
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideNav]);
  return vp;
}

/**
 * O palco do menu da IA (prancha `Al-H6c5`). Não é uma folha por cima: ao
 * abrir, a **tela atual** encolhe e sobe até virar um notch arredondado no
 * topo, e o menu se revela atrás dela, ocupando a tela. Fechar faz o inverso.
 *
 * Fechada, a tela é o fluxo normal da página (rola com a janela). Para
 * encolher, ela "congela": vira um bloco fixo do tamanho da janela, com a
 * mesma rolagem dentro, e só então anima até o notch; ao fechar, volta a ser
 * fluxo e a janela retoma a rolagem de antes.
 *
 * No desktop vale o mesmo dentro da coluna do app: a `SideNav` fica parada à
 * esquerda e é a coluna à direita dela que encolhe e revela o menu. Com
 * "reduzir movimento" a troca é instantânea.
 */
export function AiMenuStage({
  children,
  sideNav = false,
}: {
  children: ReactNode;
  /** O layout tem a `SideNav` no desktop (ocupa os 256 px da esquerda). */
  sideNav?: boolean;
}) {
  const { isOpen, close, originRef } = useContext(AiMenuContext);
  const pathname = usePathname() ?? '/';
  const vp = useViewport(sideNav);
  const [frozen, setFrozen] = useState(false);
  const [shown, setShown] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const inner = useRef<HTMLDivElement>(null);
  const reduced = prefersReducedMotion();

  // Abrir congela a tela já neste render; fechar começa a animação de volta.
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) setFrozen(true);
    else {
      setShown(false);
      setKeyboard(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      // Dois quadros: o primeiro pinta a tela congelada no tamanho cheio, para
      // a transição ter de onde partir.
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }
    const t = window.setTimeout(() => setFrozen(false), reduced ? 0 : duration.sheet + 100);
    return () => window.clearTimeout(t);
  }, [isOpen, reduced]);

  // Congelada, a tela rola dentro do próprio bloco: a barra de topo `sticky`
  // continua no lugar e o notch mostra o que a pessoa via. Ao voltar, a
  // janela retoma a rolagem e o foco volta para quem abriu.
  useLayoutEffect(() => {
    const { scrollY, focus } = originRef.current;
    if (frozen) {
      if (inner.current) inner.current.scrollTop = scrollY;
      return;
    }
    if (scrollY) window.scrollTo(0, scrollY);
    focus?.focus?.();
    originRef.current = { scrollY: 0, focus: null };
  }, [frozen, originRef]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  const frame = aiMenuFrame(vp.width, { keyboard });
  const ease = (ms: number, curve: string, delay = 0) =>
    reduced ? 'none' : `${ms}ms ${curve} ${delay}ms`;
  const notch = ease(duration.sheet, cssEasing.notch);

  const frontStyle: CSSProperties | undefined = frozen
    ? {
        position: 'fixed',
        zIndex: 10,
        overflow: 'hidden',
        top: shown ? frame.top : 0,
        left: vp.left + (shown ? frame.inset : 0),
        width: vp.width - (shown ? 2 * frame.inset : 0),
        height: shown ? frame.height : vp.height,
        borderRadius: shown ? frame.radius : 0,
        boxShadow: shown ? '0 0 0 1px rgba(255,255,255,.06)' : '0 0 0 0 rgba(0,0,0,0)',
        transition: reduced
          ? 'none'
          : ['top', 'left', 'width', 'height', 'border-radius', 'box-shadow']
              .map((p) => `${p} ${notch}`)
              .join(', '),
      }
    : undefined;

  const innerStyle: CSSProperties | undefined = frozen
    ? {
        position: 'absolute',
        top: 0,
        left: '50%',
        width: vp.width,
        height: vp.height,
        marginLeft: -vp.width / 2,
        overflow: 'hidden',
        transformOrigin: '50% 0',
        transform: shown
          ? `translateY(${-frame.lift}px) scale(${frame.scale})`
          : 'translateY(0) scale(1)',
        transition: reduced ? 'none' : `transform ${notch}`,
      }
    : undefined;

  const backLabel = aiMenuBackLabel(pathname);

  return (
    <>
      <div
        data-testid="ai-menu-front"
        data-state={shown ? 'open' : 'closed'}
        aria-hidden={isOpen || undefined}
        inert={isOpen || undefined}
        style={frontStyle}
        className={cn('bg-background', !frozen && sideNav && 'md:pl-64')}
      >
        <div ref={inner} style={innerStyle} className={cn(frozen && 'bg-background')}>
          {children}
        </div>
      </div>
      {frozen && (
        <NotchHandle
          label={backLabel}
          visible={shown}
          onClose={close}
          style={{
            top: frame.top,
            left: vp.left + frame.inset,
            width: vp.width - 2 * frame.inset,
            height: frame.height,
            borderRadius: frame.radius,
          }}
        />
      )}
      {frozen && (
        <AiMenuPanel
          shown={shown}
          reduced={reduced}
          left={vp.left}
          headerTop={frame.headerTop}
          keyboardInset={vp.keyboard}
          backLabel={backLabel}
          keyboard={keyboard}
          onKeyboard={setKeyboard}
          transition={ease(duration.sheet, cssEasing.ease, 80)}
        />
      )}
    </>
  );
}

/**
 * O notch inteiro é um botão que volta para a tela: tocar ou arrastar para
 * baixo fecha. A alcinha embaixo é o sinal de que dá para puxar.
 */
function NotchHandle({
  label,
  visible,
  onClose,
  style,
}: {
  label: string;
  visible: boolean;
  onClose: () => void;
  style: CSSProperties;
}) {
  const startY = useRef<number | null>(null);
  if (!visible) return null;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClose}
      onPointerDown={(e) => {
        startY.current = e.clientY;
      }}
      onPointerMove={(e) => {
        if (startY.current !== null && e.clientY - startY.current > AI_MENU_DRAG_CLOSE_PX) {
          startY.current = null;
          onClose();
        }
      }}
      onPointerUp={() => {
        startY.current = null;
      }}
      style={{ position: 'fixed', zIndex: 11, ...style }}
      className="touch-none border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        aria-hidden
        className="absolute bottom-2 left-1/2 -ml-[18px] h-1 w-9 rounded-sm bg-foreground/35"
      />
    </button>
  );
}

const sectionLabel = 'px-2 text-[13px] text-muted-foreground';
const roundIcon =
  'flex h-12 w-12 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_hsl(var(--border-strong))]';

/** O menu, atrás da tela que encolheu. */
function AiMenuPanel({
  shown,
  reduced,
  left,
  headerTop,
  keyboardInset,
  backLabel,
  keyboard,
  onKeyboard,
  transition,
}: {
  shown: boolean;
  reduced: boolean;
  left: number;
  headerTop: number;
  keyboardInset: number;
  backLabel: string;
  keyboard: boolean;
  onKeyboard: (on: boolean) => void;
  transition: string;
}) {
  const { close, go, pick } = useContext(AiMenuContext);
  const qc = useQueryClient();
  const availability = useChatAvailability().data;
  const usable = aiUsable(availability);
  const locked = aiLocked(availability);
  const conversations = useDrawerConversations(usable);
  const [draft, setDraft] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const back = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (shown) back.current?.focus({ preventScroll: true });
  }, [shown]);

  // Mesma chave da tela de Treino: o menu e a tela concordam sobre haver sessão aberta.
  const active = useQuery({
    queryKey: ['workout', 'active'],
    queryFn: () => workoutApi.getActiveSession(),
    retry: false,
    staleTime: 0,
  });
  const hasActive = Boolean(active.data);

  // O completar usa o que a pessoa já comeu (mesma chave da busca de comida).
  const myFoods = useQuery({
    queryKey: ['nutrition', 'my-foods', null],
    queryFn: () => nutritionApi.myFoods(),
    enabled: usable && keyboard,
    retry: false,
  });

  const start = useMutation({
    mutationFn: () => workoutApi.startSession({ startedAt: new Date().toISOString() }),
    onSuccess: (session) => {
      qc.setQueryData(['workout', 'active'], session);
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      go('/workout');
    },
  });

  const choose = (key: AiDrawerManualKey) => {
    if (key === 'workout') {
      // Retoma a sessão aberta: a API recusa a segunda (#350).
      if (hasActive) go('/workout');
      else start.mutate();
      return;
    }
    if (key === 'meal') {
      pick({ meal: { date: hojeIso(), mealType: mealTypeForTime(new Date()) } });
      return;
    }
    if (key === 'water' || key === 'weight' || key === 'steps') pick(key);
  };

  const send = (text: string) => {
    const message = text.trim();
    if (!message) return;
    const id = crypto.randomUUID();
    queueFirstMessage(id, message);
    go(`/chat/${id}`);
  };

  const ditado = useDitado(
    (texto) => setDraft((atual) => (atual.trim() ? `${atual.trimEnd()} ${texto}` : texto)),
    setNotice,
  );

  const all = conversations.data ?? [];
  const foods = myFoods.data ? [...myFoods.data.favorites, ...myFoods.data.recent] : [];
  const chipSection = drawerChipSection(draft, completionHistory(all, foods));
  const listed = drawerConversations(all, 4);
  const cta = freeOfferCta(true);
  const empty = !draft.trim();

  const manualButtons = (iconOnly: boolean) =>
    AI_DRAWER_MANUAL_ITEMS.map((item) => {
      const busy = item.key === 'workout' && (start.isPending || active.isLoading);
      const name = item.key === 'workout' ? workoutQuickLabel(hasActive) : item.label;
      return (
        <li key={item.key} className={iconOnly ? 'shrink-0' : undefined}>
          <button
            type="button"
            disabled={busy}
            aria-label={name}
            onMouseDown={iconOnly ? (e) => e.preventDefault() : undefined}
            onClick={() => choose(item.key)}
            className="anim-press flex w-full flex-col items-center gap-1 rounded-2xl text-foreground disabled:opacity-60"
          >
            <span aria-hidden className={roundIcon}>
              <Icon name={item.icon} size={16} />
            </span>
            {!iconOnly && (
              <span aria-hidden className="text-[11px] text-muted-foreground">
                {item.label}
              </span>
            )}
          </button>
        </li>
      );
    });

  const conversasButton = usable && (
    <button
      type="button"
      aria-label="Conversas"
      onClick={() => go('/chat')}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
    >
      <Icon name="list" size={16} />
    </button>
  );

  const slide = (prop: string, ms: number) =>
    reduced ? undefined : `${prop} ${ms}ms ${cssEasing.ease}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-menu-title"
      data-testid="ai-menu"
      style={{
        left,
        transformOrigin: '50% 100%',
        transform: shown ? 'none' : 'scale(.92) translateY(40px)',
        opacity: shown ? 1 : 0,
        transition: reduced ? 'none' : `transform ${transition}, opacity ${transition}`,
      }}
      className="fixed inset-y-0 right-0 z-[1] bg-sunken"
    >
      <div className="relative mx-auto h-full max-w-[480px]">
        {/* Cabeçalho: no teclado (Al-H6c7) sobe com o notch e leva o título junto. */}
        <div
          className="absolute left-3 right-4 flex items-center gap-2"
          style={{ top: headerTop, transition: slide('top', 500) }}
        >
          <button
            ref={back}
            type="button"
            aria-label={backLabel}
            onClick={close}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name="chevL" size={20} />
          </button>
          {keyboard ? (
            <h2
              id="ai-menu-title"
              className="min-w-0 flex-1 truncate font-display text-[22px] font-bold leading-tight tracking-[-0.015em]"
            >
              O que vamos registrar?
            </h2>
          ) : (
            <span className="flex-1" />
          )}
          {conversasButton}
        </div>

        <div
          className="absolute inset-x-0 flex flex-col"
          style={{
            top: headerTop + 60,
            bottom: `calc(${usable ? 22 + keyboardInset : 22}px + env(safe-area-inset-bottom))`,
            transition: slide('bottom', 450),
          }}
        >
          {keyboard ? (
            // Tocar no vazio entre o cabeçalho e a doca esconde o teclado.
            <button
              type="button"
              aria-label="Esconder teclado"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                input.current?.blur();
              }}
              className="min-h-0 flex-1 bg-transparent"
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-4">
              <h2
                id="ai-menu-title"
                className="px-6 font-display text-[22px] font-bold leading-tight tracking-[-0.015em]"
              >
                O que vamos registrar?
              </h2>

              <section aria-labelledby="ai-menu-manual" className="flex flex-col gap-2 px-4">
                <h3 id="ai-menu-manual" className={sectionLabel}>
                  Registrar manual
                </h3>
                {/* Grade de 7 da prancha; sem Hábito e Check-in (#390), sobram 5 do mesmo tamanho. */}
                <ul className="grid grid-cols-7 gap-[3px]">{manualButtons(false)}</ul>
                {start.error && (
                  <p role="alert" className="px-2 text-sm text-danger">
                    Não deu para começar o treino. Tente de novo.
                  </p>
                )}
              </section>

              {usable && listed.length > 0 && (
                <section
                  aria-labelledby="ai-menu-conversations"
                  className="flex flex-col gap-2 px-4"
                >
                  <h3 id="ai-menu-conversations" className={sectionLabel}>
                    Conversas
                  </h3>
                  <ul className="px-1">
                    {listed.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => go(`/chat/${c.id}`)}
                          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-1 text-left hover:bg-muted"
                        >
                          {c.state === 'waiting' ? (
                            <span
                              aria-hidden
                              className="anim-pulse-dot h-2 w-2 shrink-0 rounded-full bg-primary"
                            />
                          ) : c.state === 'thinking' ? (
                            <span
                              aria-hidden
                              className="ai-fab-ring h-3 w-3 shrink-0 rounded-full border-2 border-surface-3 border-t-primary"
                            />
                          ) : null}
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                            {c.title ?? 'Conversa'}
                          </span>
                          <span
                            className={cn(
                              'shrink-0 text-[13px]',
                              c.state === 'waiting'
                                ? 'font-semibold text-primary-text'
                                : c.state === 'thinking'
                                  ? 'text-faint'
                                  : 'text-muted-foreground',
                            )}
                          >
                            {conversationTimeLabel(c)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {locked && (
                <section aria-labelledby="ai-menu-pro" className="flex flex-col gap-6">
                  {/* Prancha `Al-H6c6`: o que a IA Pro faria, e o convite embaixo. */}
                  <div className="flex flex-col gap-2">
                    <h3 id="ai-menu-pro" className={cn(sectionLabel, 'px-6')}>
                      {AI_PRO_TEASER.title}
                    </h3>
                    <ul
                      aria-label="O que a IA faz"
                      className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]"
                    >
                      {AI_PRO_TEASER.items.map((item) => (
                        <li key={item} className="shrink-0">
                          <button
                            type="button"
                            aria-label={`${item} (exige o plano PRO)`}
                            onClick={() => go(AI_PRO_TEASER.href)}
                            className="anim-press flex h-11 items-center gap-2 rounded-full px-3.5 text-[13px] text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border-strong))]"
                          >
                            <Icon name="lock" size={16} />
                            {item}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {/* `card` (s2) sobre o fundo do menu, mais fundo que a tela: o
                      `muted` da folha antiga quase some no #0c0c0c e no claro. */}
                  <div className="mx-4 flex flex-col gap-3 rounded-card bg-card p-3.5">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      >
                        <Icon name="spark" size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground">{AI_PRO_TEASER.lead}</p>
                        <p className="text-[13px] text-muted-foreground">{AI_PRO_TEASER.body}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => go(cta.href)}
                        className="anim-press min-h-11 flex-1 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
                      >
                        {cta.label}
                      </button>
                      <Link
                        href="/profile/connect"
                        onClick={(e) => {
                          e.preventDefault();
                          go('/profile/connect');
                        }}
                        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border-strong))]"
                      >
                        <Icon name="link" size={16} />
                        Minha IA (MCP)
                      </Link>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {usable && (
            <div className="flex flex-col gap-3 pt-2">
              {keyboard && showManual && (
                <ul aria-label="Registrar manual" className="anim-pop flex justify-between px-4">
                  {manualButtons(true)}
                </ul>
              )}

              {(chipSection || keyboard) && (
                <ul
                  aria-label={chipSection?.title ?? 'Sugestões'}
                  className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]"
                >
                  {keyboard && empty && (
                    <li className="shrink-0">
                      <button
                        type="button"
                        aria-pressed={showManual}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setShowManual((v) => !v)}
                        className={cn(
                          'anim-press flex h-11 items-center gap-2 rounded-full px-3.5 text-[13px]',
                          showManual ? 'bg-foreground text-background' : 'bg-muted text-foreground',
                        )}
                      >
                        <Icon name="grid" size={16} />
                        Manual
                      </button>
                    </li>
                  )}
                  {chipSection?.chips.map((phrase) => {
                    const icon = chipSection.onTap === 'send' ? suggestionIcon(phrase) : null;
                    return (
                      <li key={phrase} className="shrink-0">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() =>
                            chipSection.onTap === 'fill' ? setDraft(phrase) : send(phrase)
                          }
                          className="anim-press flex h-11 items-center gap-2 rounded-full bg-muted px-3.5 text-[13px] text-foreground"
                        >
                          {icon && <Icon name={icon} size={16} className="text-faint" />}
                          {phrase}
                        </button>
                      </li>
                    );
                  })}
                  {availability?.photos && empty && (
                    <li className="shrink-0">
                      <button
                        type="button"
                        onClick={() => go('/nutrition/photo')}
                        className="anim-press flex h-11 items-center gap-2 rounded-full bg-muted px-3.5 text-[13px] text-foreground"
                      >
                        <Icon name="camera" size={16} className="text-faint" />
                        Foto do prato
                      </button>
                    </li>
                  )}
                </ul>
              )}

              {notice && (
                <p role="alert" className="px-6 text-xs text-danger">
                  {notice}
                </p>
              )}

              <form
                className="flex items-center gap-2 px-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(draft);
                }}
              >
                <div className="flex h-14 min-w-0 flex-1 items-center gap-1 rounded-full bg-muted ps-1.5 pe-4 shadow-[inset_0_0_0_1.5px_hsl(var(--primary)/0.35)]">
                  {availability?.photos ? (
                    <button
                      type="button"
                      aria-label="Foto do prato"
                      onClick={() => go('/nutrition/photo')}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground"
                    >
                      <Icon name="camera" size={20} />
                    </button>
                  ) : (
                    <span className="w-3" />
                  )}
                  <input
                    ref={input}
                    type="text"
                    aria-label="Pergunte ou registre com a IA"
                    placeholder={aiMenuPlaceholder(all)}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onFocus={() => onKeyboard(true)}
                    onBlur={() => {
                      onKeyboard(false);
                      setShowManual(false);
                    }}
                    enterKeyHint="send"
                    className="h-[52px] min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-faint"
                  />
                </div>
                {draft.trim() ? (
                  <button
                    type="submit"
                    aria-label="Enviar"
                    onMouseDown={(e) => e.preventDefault()}
                    className="anim-press flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  >
                    <Icon name="send" size={22} />
                  </button>
                ) : availability?.dictation ? (
                  <button
                    type="button"
                    aria-label={ditado.estado === 'gravando' ? 'Parar o ditado' : 'Ditar'}
                    aria-pressed={ditado.estado === 'gravando'}
                    disabled={ditado.estado === 'transcrevendo'}
                    onClick={() =>
                      ditado.estado === 'gravando' ? ditado.parar() : void ditado.comecar()
                    }
                    className="anim-press flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-60"
                  >
                    <Icon name={ditado.estado === 'gravando' ? 'pause' : 'mic'} size={22} />
                  </button>
                ) : null}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
