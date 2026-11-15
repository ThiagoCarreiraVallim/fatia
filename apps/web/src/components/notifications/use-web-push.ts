'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, vapidKeyBytes } from '@fatia/api-client';

const STATUS_KEY = ['users', 'me', 'web-push'] as const;

export type WebPushState = 'checking' | 'unsupported' | 'off' | 'on' | 'denied';

/** O navegador sabe receber push? No iPhone, só com o app na tela de início. */
function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * O push deste navegador (Fase 9g, ADR 036): em que pé está e o "Liberar" da
 * faixa de Lembretes (prancha Al-V2, #389), que pede a permissão e inscreve o
 * navegador com a chave da instância. Sem chave (`publicKey: null`) a
 * instância não manda push pela web e a faixa não aparece.
 */
export function useWebPush() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => notificationsApi.webPushStatus(),
  });
  const [state, setState] = useState<WebPushState>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Só no navegador, depois de montar: no servidor não há `navigator`.
    void Promise.resolve()
      .then(async (): Promise<WebPushState> => {
        if (!supported()) return 'unsupported';
        if (Notification.permission === 'denied') return 'denied';
        if (Notification.permission !== 'granted') return 'off';
        const reg = await navigator.serviceWorker.ready;
        return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
      })
      .catch((): WebPushState => 'off')
      .then(setState);
  }, []);

  const publicKey = status.data?.publicKey ?? null;

  /** Pede a permissão e inscreve. Devolve o estado final. */
  const enable = useCallback(async (): Promise<WebPushState> => {
    if (!publicKey || !supported()) return state;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        const next = permission === 'denied' ? 'denied' : 'off';
        setState(next);
        return next;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKeyBytes(publicKey) as BufferSource,
        }));
      const json = sub.toJSON();
      await notificationsApi.subscribeWebPush({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      });
      setState('on');
      void qc.invalidateQueries({ queryKey: STATUS_KEY });
      return 'on';
    } finally {
      setBusy(false);
    }
  }, [publicKey, qc, state]);

  return {
    state,
    busy,
    /** A instância manda push pela web e o navegador sabe receber. */
    available: !!publicKey && state !== 'unsupported' && state !== 'checking',
    enable,
  };
}
