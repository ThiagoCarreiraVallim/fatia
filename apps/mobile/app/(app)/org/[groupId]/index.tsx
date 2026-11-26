import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  groupCan,
  orgApi,
  panelHref,
  pendingRequests,
  seatSummary,
  seatsApi,
  type MyGroup,
} from '@fatia/api-client';
import { InsightsCard } from '@/components/org/insights-card';
import { OrgPanel, orgKeys } from '@/components/org/org-panel';
import { RepeatGuideButton, SetupChecklist, useSetup } from '@/components/org/setup-guide';
import { LoadingState } from '@/components/ui';

function Numero({
  titulo,
  valor,
  detalhe,
  onPress,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'link' : undefined}
      accessibilityLabel={`${titulo}: ${valor}${detalhe ? `, ${detalhe}` : ''}`}
      disabled={!onPress}
      onPress={onPress}
      className="min-w-[46%] flex-1 gap-0.5 rounded-2xl border border-border bg-card p-4 active:opacity-80"
    >
      <Text className="text-xs text-muted-foreground">{titulo}</Text>
      <Text className="text-2xl font-bold text-foreground">{valor}</Text>
      {detalhe ? <Text className="text-xs text-muted-foreground">{detalhe}</Text> : null}
    </Pressable>
  );
}

/**
 * O Início do painel no app. Com o guia de primeiros passos à vista (#372,
 * Onb-C3), ele toma o lugar dos números; sem a marca salva, volta à Marca
 * (os passos 1 e 2 bloqueiam).
 */
function Inicio({ g }: { g: MyGroup }) {
  const router = useRouter();
  const setup = useSetup(g);
  const brandPending = Boolean(setup.data?.visible && setup.data.brandPending);
  useEffect(() => {
    if (brandPending) router.replace(`/community/new/${g.id}`);
  }, [brandPending, g.id, router]);
  if (g.role === 'OWNER' && !g.isDemo && setup.isPending) {
    return <LoadingState label="Carregando…" />;
  }
  if (setup.data?.visible) return <SetupChecklist g={g} setup={setup.data} />;
  return <VisaoGeral g={g} />;
}

function VisaoGeral({ g }: { g: MyGroup }) {
  const router = useRouter();
  const dono = g.role === 'OWNER';
  const membros = useQuery({
    queryKey: orgKeys.members(g.id),
    queryFn: () => orgApi.members(g.id),
  });
  const convites = useQuery({
    queryKey: orgKeys.invites(g.id),
    queryFn: () => orgApi.invites(g.id),
  });
  const assentos = useQuery({
    queryKey: orgKeys.seats(g.id),
    queryFn: () => seatsApi.get(g.id),
    enabled: dono,
  });

  if (membros.isPending) return <LoadingState label="Carregando…" />;
  const lista = membros.data ?? [];
  const ativos = lista.filter((m) => m.status === 'ACTIVE').length;
  const pedidos = pendingRequests(lista).length;
  const compartilhando = lista.filter((m) => (m.scopesGrantedToMe?.length ?? 0) > 0).length;

  return (
    <>
      <View className="flex-row flex-wrap gap-3">
        <Numero
          titulo="Membros ativos"
          valor={String(ativos)}
          onPress={() => router.replace(panelHref(g.id, 'members'))}
        />
        <Numero
          titulo="Pedidos aguardando"
          valor={String(pedidos)}
          detalhe={pedidos > 0 && groupCan(g, 'member.approve') ? 'Toque para aprovar' : undefined}
          onPress={() => router.replace(`${panelHref(g.id, 'members')}?filtro=pending`)}
        />
        <Numero titulo="Compartilham com você" valor={String(compartilhando)} />
        {dono ? (
          <Numero
            titulo="Assentos PRO"
            valor={
              assentos.data?.pool ? `${assentos.data.assigned}/${assentos.data.pool.seats}` : '0'
            }
            detalhe={assentos.data ? seatSummary(assentos.data) : undefined}
            onPress={() => router.replace(panelHref(g.id, 'seats'))}
          />
        ) : (
          <Numero
            titulo="Convites abertos"
            valor={String(convites.data?.length ?? 0)}
            onPress={() => router.replace(panelHref(g.id, 'invites'))}
          />
        )}
      </View>
      {dono ? (
        <>
          <InsightsCard groupId={g.id} panel="retention" title="Retenção" />
          {!g.isDemo ? <RepeatGuideButton groupId={g.id} /> : null}
        </>
      ) : (
        <Text className="text-xs text-muted-foreground">
          Os números agregados da comunidade são do dono. Você vê cada membro pelo que ele
          compartilha com você, em Membros.
        </Text>
      )}
    </>
  );
}

/** Equivalente de `apps/web/src/app/(org)/org/[groupId]/page.tsx`. */
export default function OrgOverviewScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return (
    <OrgPanel groupId={groupId} title={(g) => g.name}>
      {(g) => <Inicio g={g} />}
    </OrgPanel>
  );
}
