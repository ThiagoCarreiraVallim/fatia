import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activePanelSection,
  ApiError,
  canOpenPanel,
  groupsApi,
  panelHref,
  panelSections,
  type MyGroup,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, EmptyState, ErrorState, LoadingState, cn } from '@/components/ui';

/** Chaves do painel: tudo sob `['community', 'org', groupId]`, como na web. */
export const orgKeys = {
  all: (groupId: string) => ['community', 'org', groupId] as const,
  group: (groupId: string) => ['community', 'group', groupId] as const,
  members: (groupId: string) => ['community', 'org', groupId, 'members'] as const,
  invites: (groupId: string) => ['community', 'org', groupId, 'invites'] as const,
  seats: (groupId: string) => ['community', 'org', groupId, 'seats'] as const,
  invoices: (groupId: string) => ['community', 'org', groupId, 'invoices'] as const,
  contentPlans: (groupId: string) => ['community', 'org', groupId, 'content', 'plans'] as const,
  contentPlan: (groupId: string, id: string) =>
    ['community', 'org', groupId, 'content', 'plans', id] as const,
  contentTips: (groupId: string) => ['community', 'org', groupId, 'content', 'tips'] as const,
  exercises: (groupId: string) => ['community', 'org', groupId, 'exercises'] as const,
  exercise: (groupId: string, id: number) =>
    ['community', 'org', groupId, 'exercises', id] as const,
  insightsPanels: (groupId: string) => ['community', 'org', groupId, 'insights'] as const,
  insightsCuts: (groupId: string, panel: string) =>
    ['community', 'org', groupId, 'insights', panel] as const,
  insights: (groupId: string, panel: string, cut: string, period: string) =>
    ['community', 'org', groupId, 'insights', panel, cut, period] as const,
};

/** A mensagem da API quando é recado para a pessoa (4xx); senão, a padrão. */
export function apiMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : fallback;
}

/**
 * Moldura do painel da comunidade no app — equivalente de
 * `apps/web/src/components/org/org-shell.tsx`: confere que quem abriu é da
 * equipe e mostra as seções do papel como abas no topo. Trocar de aba troca de
 * rota sem empilhar, e puxar para baixo recarrega o painel inteiro.
 */
export function OrgPanel({
  groupId,
  title,
  children,
}: {
  groupId: string;
  /** Título da barra; o padrão é o do mapa de rotas. */
  title?: string | ((group: MyGroup) => string | undefined);
  children: (group: MyGroup) => ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const group = useQuery({
    queryKey: orgKeys.group(groupId),
    queryFn: () => groupsApi.get(groupId),
    retry: false,
  });

  if (group.isPending) {
    return (
      <Screen>
        <LoadingState label="Carregando o painel…" />
      </Screen>
    );
  }
  const negado = group.isError && group.error instanceof ApiError && group.error.isNotFound;
  if (group.isError && !negado) {
    return (
      <Screen>
        <ErrorState error={group.error} onRetry={() => void group.refetch()} />
      </Screen>
    );
  }
  if (!group.data || !canOpenPanel(group.data)) {
    return (
      <Screen>
        <View className="px-5 pt-6">
          <EmptyState
            title="Painel indisponível"
            description="O painel é de quem administra ou atende nesta comunidade."
            action={
              <Button variant="outline" onPress={() => router.replace('/community')}>
                Minhas comunidades
              </Button>
            }
          />
        </View>
      </Screen>
    );
  }

  const g = group.data;
  const ativa = activePanelSection(pathname);

  return (
    <Screen
      title={typeof title === 'function' ? title(g) : title}
      onRefresh={() => {
        void qc.invalidateQueries({ queryKey: orgKeys.all(groupId) });
        void group.refetch();
      }}
      refreshing={group.isRefetching}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-5 pt-3"
        accessibilityRole="tablist"
      >
        {panelSections(g.role).map((s) => {
          const on = s.section === ativa;
          return (
            <Pressable
              key={s.section}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => {
                if (!on) router.replace(panelHref(g.id, s.section));
              }}
              className={cn(
                'min-h-[44px] justify-center rounded-full px-4 active:opacity-80',
                on ? 'bg-primary' : 'bg-muted',
              )}
            >
              <Text
                className={cn(
                  'text-sm font-semibold',
                  on ? 'text-primary-foreground' : 'text-foreground',
                )}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View className="gap-4 px-5 pb-4 pt-4">{children(g)}</View>
    </Screen>
  );
}

/** Escolha única em pílulas (papel, regra de entrada, filtro): sem Select no app. */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="gap-1.5">
      {label ? <Text className="text-xs text-muted-foreground">{label}</Text> : null}
      <View
        className="flex-row flex-wrap gap-2"
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => onChange(o.value)}
              className={cn(
                'min-h-[44px] justify-center rounded-full px-4 active:opacity-80',
                on ? 'bg-primary' : 'bg-muted',
              )}
            >
              <Text
                className={cn(
                  'text-sm font-semibold',
                  on ? 'text-primary-foreground' : 'text-foreground',
                )}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Cartão de seção do painel. */
export function PanelCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      {title ? (
        <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
