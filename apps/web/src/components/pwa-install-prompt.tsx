'use client';

import { useEffect, useState } from 'react';
import { Download, Share, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Evento não-padrão disparado pelo Chrome/Edge/Android antes de oferecer a instalação.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'fatia:pwa-install-dismissed';
// Quanto tempo aguardar antes de mostrar de novo após o usuário dispensar (ms).
const DISMISS_TTL = 1000 * 60 * 60 * 24 * 7; // 7 dias

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari expõe navigator.standalone fora do padrão.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const iOSDevice = /iphone|ipad|ipod/i.test(ua);
  // iPadOS recente se identifica como Mac, mas tem touch.
  const iPadOS = /macintosh/i.test(ua) && 'ontouchend' in document;
  return iOSDevice || iPadOS;
}

function wasRecentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts < DISMISS_TTL;
  } catch {
    return false;
  }
}

export function PwaInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [iosMode, setIosMode] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Já instalado ou dispensado recentemente: nunca mostra.
    if (isStandalone() || wasRecentlyDismissed()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIosMode(false);
      setVisible(true);
    };

    const onInstalled = () => {
      // Instalou: esconde e não mostra mais.
      setVisible(false);
      setDeferredPrompt(null);
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {
        // ignore
      }
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // iOS não dispara beforeinstallprompt — mostramos instruções manuais.
    //
    // Silenciado, não corrigido (#187). Derivar isto no render é justamente o
    // que não pode: `isIos()` lê `navigator.userAgent` e `document`, que no
    // servidor não existem, e este componente é renderizado no servidor pelo
    // Next. Decidir a visibilidade durante o render faria o HTML do servidor
    // divergir do primeiro render do cliente e quebraria a hidratação. O valor
    // só é conhecível depois de montar, que é o que o efeito faz.
    if (isIos()) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setIosMode(true);
      setVisible(true);
      /* eslint-enable react-hooks/set-state-in-effect */
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
    // Se recusou, evita reaparecer logo em seguida.
    if (outcome === 'dismissed') {
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {
        // ignore
      }
    }
    // Se aceitou, o evento `appinstalled` cuida da persistência.
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-20 z-[60] px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
      role="dialog"
      aria-label="Instalar o Fatia"
    >
      <div className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-white/10 bg-muted/95 p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Download size={22} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Instale o Fatia</p>

          {iosMode ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <span>Toque em</span>
              <Share size={14} className="inline" aria-label="Compartilhar" />
              <span>e depois em</span>
              <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
                <Plus size={14} className="inline" />
                Adicionar à Tela de Início
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Adicione à tela inicial para abrir mais rápido e usar offline.
            </p>
          )}

          {!iosMode && (
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={handleInstall} className="flex-1">
                Adicionar à tela inicial
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>
                Agora não
              </Button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Fechar aviso de instalação"
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
