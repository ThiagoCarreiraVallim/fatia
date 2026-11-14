'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AI_DRAWER_MANUAL_ITEMS,
  AI_DRAWER_SUGGESTIONS,
  AI_PRO_TEASER,
  completionsFor,
  conversationTimeLabel,
  drawerConversations,
  freeOfferCta,
  mealTypeForTime,
  workoutApi,
  workoutQuickLabel,
  type AiDrawerManualKey,
  type MealType,
} from '@fatia/api-client';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
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

interface AiDrawerState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const AiDrawerContext = createContext<AiDrawerState>({
  isOpen: false,
  open: () => undefined,
  close: () => undefined,
});

/** Abre o menu da IA. Quem chama é o botão da IA da barra de baixo e o da lateral. */
export function useAiDrawer(): AiDrawerState {
  return useContext(AiDrawerContext);
}

/** Marca da entrada no histórico que o menu aberto ocupa (o "voltar" fecha o menu). */
const HISTORY_MARK = 'fatiaAiDrawer';

/**
 * O menu do botão da IA, "O que vamos registrar?" (ADR 040, prancha
 * `Ia-Drawer`). O registro manual vem primeiro e funciona sem IA, no Free e com
 * a IA fora do ar (PRD §3.1); a parte da IA só aparece quando a instância a tem.
 *
 * O menu só escolhe: quem registra são as folhas de sempre (busca de comida,
 * água, peso, passos). No celular é uma folha de baixo; no desktop a mesma
 * folha abre como painel de 480 px à direita (`ui/drawer.tsx`). Esc fecha (o
 * Radix por trás do `vaul`), e o "voltar" do navegador também: abrir empilha
 * uma entrada no histórico, e o `popstate` fecha.
 */
export function AiDrawerProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const pushed = useRef(false);

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
    setIsOpen(true);
    if (!pushed.current) {
      pushed.current = true;
      window.history.pushState({ ...window.history.state, [HISTORY_MARK]: true }, '');
    }
  }, []);

  /** Fecha pelo X, Esc ou toque fora: desfaz a entrada que o abrir empilhou. */
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

  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
  const meal = typeof target === 'object' && target !== null ? target.meal : null;
  const closeTarget = () => setTarget(null);

  return (
    <AiDrawerContext.Provider value={value}>
      {children}
      <Drawer open={isOpen} onOpenChange={(o) => (o ? open() : close())}>
        <DrawerContent className="px-0 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6">
          {isOpen ? <AiDrawerBody onPick={pick} onGo={go} /> : null}
        </DrawerContent>
      </Drawer>
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
    </AiDrawerContext.Provider>
  );
}

const sectionLabel = 'px-2 text-[13px] font-semibold text-muted-foreground';

function AiDrawerBody({
  onPick,
  onGo,
}: {
  onPick: (t: Target) => void;
  onGo: (href: string) => void;
}) {
  const qc = useQueryClient();
  const availability = useChatAvailability().data;
  const usable = aiUsable(availability);
  const locked = aiLocked(availability);
  const conversations = useDrawerConversations(usable);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Mesma chave da tela de Treino: o menu e a tela concordam sobre haver sessão aberta.
  const active = useQuery({
    queryKey: ['workout', 'active'],
    queryFn: () => workoutApi.getActiveSession(),
    retry: false,
    staleTime: 0,
  });
  const hasActive = Boolean(active.data);

  const start = useMutation({
    mutationFn: () => workoutApi.startSession({ startedAt: new Date().toISOString() }),
    onSuccess: (session) => {
      qc.setQueryData(['workout', 'active'], session);
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      onGo('/workout');
    },
  });

  const choose = (key: AiDrawerManualKey) => {
    if (key === 'workout') {
      // Retoma a sessão aberta: a API recusa a segunda (#350).
      if (hasActive) onGo('/workout');
      else start.mutate();
      return;
    }
    if (key === 'meal') {
      onPick({ meal: { date: hojeIso(), mealType: mealTypeForTime(new Date()) } });
      return;
    }
    if (key === 'water' || key === 'weight' || key === 'steps') onPick(key);
  };

  const send = (text: string) => {
    const message = text.trim();
    if (!message) return;
    const id = crypto.randomUUID();
    queueFirstMessage(id, message);
    onGo(`/chat/${id}`);
  };

  const ditado = useDitado(
    (texto) => setDraft((atual) => (atual.trim() ? `${atual.trimEnd()} ${texto}` : texto)),
    setNotice,
  );

  // Teclado aberto (prancha `Al-H6c7`): as conversas recolhem e o registro
  // manual vira um alternador, para o campo e os chips caberem.
  const keyboard = typing;
  const manualVisible = !keyboard || showManual;
  const chips = draft.trim() ? completionsFor(draft) : [...AI_DRAWER_SUGGESTIONS];
  const listed = drawerConversations(conversations.data ?? [], 4);
  const cta = freeOfferCta(true);

  return (
    <div className="flex max-h-[85dvh] flex-col gap-5 overflow-y-auto md:max-h-none md:flex-1">
      <DrawerHeader className="flex flex-row items-center gap-2 px-6 pt-3">
        <DrawerTitle className="min-w-0 flex-1 font-display text-[22px] font-semibold leading-tight">
          O que vamos registrar?
        </DrawerTitle>
        <DrawerDescription className="sr-only">
          Registre na mão ou fale com a IA do Fatia
        </DrawerDescription>
        {usable && (
          <button
            type="button"
            aria-label="Conversas"
            onClick={() => onGo('/chat')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <Icon name="list" size={18} />
          </button>
        )}
      </DrawerHeader>

      <section aria-labelledby="ai-drawer-manual" className="flex flex-col gap-2 px-4">
        <div className="flex items-center justify-between">
          <h3 id="ai-drawer-manual" className={sectionLabel}>
            Registrar manual
          </h3>
          {keyboard && (
            <button
              type="button"
              aria-pressed={showManual}
              // Sem roubar o foco do campo: o teclado continua aberto.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowManual((v) => !v)}
              className="min-h-11 rounded-full px-3 text-[13px] font-semibold text-foreground"
            >
              Manual
            </button>
          )}
        </div>
        {manualVisible && (
          <ul className="grid grid-cols-5 gap-1">
            {AI_DRAWER_MANUAL_ITEMS.map((item) => {
              const busy = item.key === 'workout' && (start.isPending || active.isLoading);
              const name = item.key === 'workout' ? workoutQuickLabel(hasActive) : item.label;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={name}
                    onClick={() => choose(item.key)}
                    className="anim-press flex w-full flex-col items-center gap-1 rounded-2xl py-1 text-foreground disabled:opacity-60"
                  >
                    <span
                      aria-hidden
                      className="flex h-12 w-12 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_hsl(var(--border-strong))]"
                    >
                      <Icon name={item.icon} size={18} />
                    </span>
                    <span aria-hidden className="text-[11px] text-muted-foreground">
                      {item.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {start.error && (
          <p role="alert" className="px-2 text-sm text-danger">
            Não deu para começar o treino. Tente de novo.
          </p>
        )}
      </section>

      {usable && !keyboard && listed.length > 0 && (
        <section aria-labelledby="ai-drawer-conversations" className="flex flex-col gap-1 px-4">
          <h3 id="ai-drawer-conversations" className={sectionLabel}>
            Conversas
          </h3>
          <ul>
            {listed.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onGo(`/chat/${c.id}`)}
                  className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-muted"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {c.title ?? 'Conversa'}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-[13px]',
                      c.state === 'waiting'
                        ? 'font-semibold text-primary-text'
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
        <section
          aria-labelledby="ai-drawer-pro"
          className="mx-4 flex flex-col gap-3 rounded-3xl bg-muted p-4"
        >
          <div>
            <h3 id="ai-drawer-pro" className="text-[13px] font-semibold text-muted-foreground">
              {AI_PRO_TEASER.title}
            </h3>
            <p className="font-display text-lg font-semibold text-foreground">
              {AI_PRO_TEASER.lead}
            </p>
            <p className="text-sm text-muted-foreground">{AI_PRO_TEASER.body}</p>
          </div>
          <ul className="flex flex-col gap-1">
            {AI_PRO_TEASER.items.map((item) => (
              <li key={item}>
                <button
                  type="button"
                  onClick={() => onGo(AI_PRO_TEASER.href)}
                  className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left text-sm text-foreground hover:bg-card"
                >
                  <Icon name="lock" size={14} className="text-muted-foreground" />
                  <span className="flex-1">{item}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onGo(cta.href)}
              className="anim-press min-h-11 flex-1 rounded-full bg-foreground px-4 text-sm font-bold text-background"
            >
              {cta.label}
            </button>
            <Link
              href="/profile/connect"
              onClick={(e) => {
                e.preventDefault();
                onGo('/profile/connect');
              }}
              className="flex min-h-11 items-center rounded-full bg-card px-4 text-sm font-semibold text-foreground"
            >
              Minha IA (MCP)
            </Link>
          </div>
        </section>
      )}

      {usable && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className={cn(sectionLabel, 'px-6')}>
              {draft.trim() ? 'Completar' : 'Sugestões'}
            </span>
            <ul
              aria-label={draft.trim() ? 'Completar' : 'Sugestões'}
              className="flex gap-2 overflow-x-auto px-4 pb-1"
            >
              {chips.map((phrase) => (
                <li key={phrase} className="shrink-0">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => (draft.trim() ? setDraft(phrase) : send(phrase))}
                    className="anim-press h-11 rounded-full bg-muted px-4 text-[13px] text-foreground"
                  >
                    {phrase}
                  </button>
                </li>
              ))}
              {availability?.photos && !draft.trim() && (
                <li className="shrink-0">
                  <button
                    type="button"
                    onClick={() => onGo('/nutrition/photo')}
                    className="anim-press flex h-11 items-center gap-2 rounded-full bg-muted px-4 text-[13px] text-foreground"
                  >
                    <Icon name="camera" size={16} className="text-faint" />
                    Foto do prato
                  </button>
                </li>
              )}
            </ul>
          </div>

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
            <div className="flex h-14 min-w-0 flex-1 items-center gap-1 rounded-full bg-muted ps-1.5 pe-4 shadow-[inset_0_0_0_1.5px_hsl(var(--primary)/0.45)]">
              {availability?.photos ? (
                <button
                  type="button"
                  aria-label="Foto do prato"
                  onClick={() => onGo('/nutrition/photo')}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground"
                >
                  <Icon name="camera" size={20} />
                </button>
              ) : (
                <span className="w-3" />
              )}
              <input
                type="text"
                aria-label="Pergunte ou registre com a IA"
                placeholder="Comi, treinei… ou pergunte"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                enterKeyHint="send"
                className="h-12 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-faint"
              />
            </div>
            {draft.trim() ? (
              <button
                type="submit"
                aria-label="Enviar"
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
  );
}
