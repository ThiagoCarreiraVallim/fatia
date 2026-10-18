'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Smartphone } from 'lucide-react';
import {
  deviceLabel,
  NOTIFICATION_KIND_INFO,
  NOTIFICATION_KINDS,
  notificationsApi,
  type NotificationPreferences,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const PREFS_KEY = ['users', 'me', 'notifications'] as const;
const DEVICES_KEY = ['users', 'me', 'devices'] as const;

/**
 * Perfil → Notificações (Fase 8c, ADR 033). Os avisos chegam só pelo app;
 * daqui dá para escolher o que chega e tirar um celular que não é mais seu.
 */
export default function NotificationsPage() {
  const qc = useQueryClient();
  const prefs = useQuery({ queryKey: PREFS_KEY, queryFn: () => notificationsApi.preferences() });
  const devices = useQuery({ queryKey: DEVICES_KEY, queryFn: () => notificationsApi.devices() });

  const salvar = useMutation({
    mutationFn: (input: Partial<NotificationPreferences>) => notificationsApi.setPreferences(input),
    onSuccess: (r) => qc.setQueryData(PREFS_KEY, r),
  });
  const tirar = useMutation({
    mutationFn: (id: string) => notificationsApi.removeDevice(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: DEVICES_KEY }),
  });

  return (
    <div className="space-y-6 px-5 pt-4 pb-8">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Os avisos chegam pelo app do Fatia no celular, para convites, desafios e o mural das suas
        comunidades. Eles nunca mostram dado de saúde nem o texto de um post.
      </p>

      <section className="space-y-2" aria-labelledby="o-que-chega">
        <h2 id="o-que-chega" className="text-sm font-semibold">
          O que chega
        </h2>
        {prefs.isPending && <Skeleton className="h-40 rounded-2xl bg-card" />}
        {prefs.isError && (
          <p role="alert" className="text-sm text-muted-foreground">
            Não deu para carregar.{' '}
            <button type="button" className="underline" onClick={() => prefs.refetch()}>
              Tentar de novo
            </button>
          </p>
        )}
        {prefs.data && (
          <div className="space-y-2">
            {NOTIFICATION_KINDS.map((k) => (
              <label
                key={k}
                className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-subtle bg-card px-3 py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              >
                <span>
                  <span className="block text-sm font-semibold">
                    {NOTIFICATION_KIND_INFO[k].label}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {NOTIFICATION_KIND_INFO[k].hint}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="h-5 w-5 accent-primary"
                  checked={prefs.data[k]}
                  disabled={salvar.isPending}
                  onChange={(e) => salvar.mutate({ [k]: e.target.checked })}
                />
              </label>
            ))}
            {salvar.isError && (
              <p role="alert" className="text-xs text-danger">
                Não deu para salvar agora. Tente de novo.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="celulares">
        <h2 id="celulares" className="text-sm font-semibold">
          Celulares que recebem
        </h2>
        {devices.data && devices.data.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhum ainda. No app, abra Perfil → Notificações e ligue os avisos.
          </p>
        )}
        {devices.data && devices.data.length > 0 && (
          <ul className="divide-y rounded-2xl border border-subtle bg-card">
            {devices.data.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <Smartphone size={18} className="text-primary" aria-hidden />
                <span className="flex-1">{deviceLabel(d)}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={tirar.isPending}
                  onClick={() => tirar.mutate(d.id)}
                  aria-label={`Parar avisos no ${deviceLabel(d)}`}
                >
                  Tirar
                </Button>
              </li>
            ))}
          </ul>
        )}
        {tirar.isError && (
          <p role="alert" className="text-xs text-danger">
            Não deu para tirar agora. Tente de novo.
          </p>
        )}
      </section>
    </div>
  );
}
