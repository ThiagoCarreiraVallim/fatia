'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, vapidKeyBytes } from '@fatia/api-client';

const STATUS_KEY = ['users', 'me', 'web-push'] as const;

type Estado = 'checking' | 'unsupported' | 'off' | 'on' | 'denied';

/** O navegador sabe receber push? No iPhone, só com o app na tela de início. */
function suportado(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * "Avisos neste navegador" (Fase 9g): inscreve o navegador no Web Push com a
 * chave da instância. Os avisos são os mesmos do celular, com as mesmas
 * preferências; o texto nunca traz dado de saúde.
 */
export function WebPushToggle() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => notificationsApi.webPushStatus(),
  });
  const [estado, setEstado] = useState<Estado>('checking');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    // Só no navegador, depois de montar: no servidor não há `navigator`.
    void Promise.resolve()
      .then(async (): Promise<Estado> => {
        if (!suportado()) return 'unsupported';
        if (Notification.permission === 'denied') return 'denied';
        const reg = await navigator.serviceWorker.ready;
        return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
      })
      .catch((): Estado => 'off')
      .then(setEstado);
  }, []);

  const chave = status.data?.publicKey;
  if (status.isPending || !chave) return null;

  const alternar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const atual = await reg.pushManager.getSubscription();
      if (estado === 'on') {
        if (atual) {
          await notificationsApi.unsubscribeWebPush(atual.endpoint).catch(() => undefined);
          await atual.unsubscribe();
        }
        setEstado('off');
      } else {
        const permissao = await Notification.requestPermission();
        if (permissao !== 'granted') {
          setEstado(permissao === 'denied' ? 'denied' : 'off');
          return;
        }
        const sub =
          atual ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapidKeyBytes(chave) as BufferSource,
          }));
        const json = sub.toJSON();
        await notificationsApi.subscribeWebPush({
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? '',
          auth: json.keys?.auth ?? '',
        });
        setEstado('on');
      }
      void qc.invalidateQueries({ queryKey: STATUS_KEY });
    } catch {
      setErro('Não deu para mudar agora. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="space-y-2" aria-labelledby="neste-navegador">
      <h2 id="neste-navegador" className="text-sm font-semibold">
        Neste navegador
      </h2>
      {estado === 'unsupported' ? (
        <p className="text-xs text-muted-foreground">
          Este navegador não recebe avisos. No iPhone, eles funcionam com o Fatia adicionado à tela
          de início (iOS 16.4 ou mais novo).
        </p>
      ) : (
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-subtle bg-card px-3 py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
          <span>
            <span className="block text-sm font-semibold">Avisos neste navegador</span>
            <span className="block text-xs text-muted-foreground">
              Os mesmos do celular, com as escolhas acima. Nunca dado de saúde.
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="h-5 w-5 accent-primary"
            checked={estado === 'on'}
            disabled={ocupado || estado === 'checking' || estado === 'denied'}
            onChange={() => void alternar()}
          />
        </label>
      )}
      {estado === 'denied' ? (
        <p role="alert" className="text-xs text-muted-foreground">
          O navegador está bloqueando os avisos do Fatia. Libere nas configurações do site.
        </p>
      ) : null}
      {erro ? (
        <p role="alert" className="text-xs text-danger">
          {erro}
        </p>
      ) : null}
    </section>
  );
}
