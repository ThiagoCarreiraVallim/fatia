import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  billingApi,
  planStatusView,
  usersApi,
  type MyPlan,
  type PlanAction,
  type ProFeature,
} from '@fatia/api-client';
import {
  comprar,
  inAppPurchaseAvailable,
  pacotesDoPro,
  restaurarCompras,
  storeLogIn,
  type PurchasesPackage,
} from '@/billing/purchases';
import { PRO_VIA_COMMUNITY } from '@/billing/plan-offer';
import { PlanStatusCard } from '@/components/billing/plan-status-card';
import { CommunityOffer, ProHero, StoreOffer, TrialDrawer } from '@/components/billing/store-offer';
import { JoinByCodeDrawer } from '@/components/community/join-by-code-drawer';
import { Screen } from '@/components/layout/screen';
import { mensagemDeErro } from '@/components/nutrition/helpers';
import { DrawerLayer, ErrorState, LoadingState } from '@/components/ui';
import { Text } from '@/components/ui/text';

/**
 * "Meu plano" no app (#386; pranchas Al-M2, Al-M3, Al-M5, Al-M13 e Al-M13d).
 *
 * **O app nunca vende fora da loja.** O cartão sai de `planStatusView` com
 * `surface: 'app'`, que nunca devolve link de pagamento, preço da web, Pix ou
 * boleto; a assinatura feita na web aparece com o estado e as datas ("Fora do
 * app"), sem botão. A compra é só pela App Store / Google Play, e só com
 * `EXPO_PUBLIC_IAP_ENABLED` (sem ela a RevenueCat nem é configurada e a oferta
 * vira "O PRO vem pela sua comunidade").
 */
export default function PlanScreen() {
  const { recurso } = useLocalSearchParams<{ recurso?: ProFeature }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [bought, setBought] = useState(false);
  const [trial, setTrial] = useState<{
    pkg: PurchasesPackage;
    days: number;
    price: string;
  } | null>(null);
  const iap = inAppPurchaseAvailable();

  const plano = useQuery({ queryKey: ['billing', 'plan'], queryFn: () => billingApi.plan() });
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const view = plano.data
    ? planStatusView(plano.data, { surface: 'app', canPurchase: iap, now: new Date() })
    : null;
  const vende = view?.offer === 'store' && Boolean(me.data?.id);

  const pacotes = useQuery({
    queryKey: ['billing', 'store-packages', me.data?.id],
    queryFn: async () => {
      await storeLogIn(me.data!.id);
      return pacotesDoPro();
    },
    enabled: vende,
    staleTime: 10 * 60_000,
  });

  const atualizar = (novo: MyPlan) => {
    qc.setQueryData(['billing', 'plan'], novo);
    // O cadeado da foto, do chat e do menu dependem do plano.
    void qc.invalidateQueries({ queryKey: ['nutrition', 'photo-recognition'] });
    void qc.invalidateQueries({ queryKey: ['chat'] });
  };

  const assinar = useMutation({
    mutationFn: async (pacote: PurchasesPackage) => {
      const comprou = await comprar(pacote);
      return comprou ? billingApi.revenueCatSync() : null;
    },
    onMutate: () => setErro(null),
    onSuccess: (novo) => {
      if (!novo) return;
      atualizar(novo);
      setBought(novo.tier === 'PRO');
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  const restaurar = useMutation({
    mutationFn: async () => {
      await storeLogIn(me.data!.id);
      await restaurarCompras();
      return billingApi.revenueCatSync();
    },
    onMutate: () => setErro(null),
    onSuccess: atualizar,
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  const openAi = () => router.push('/chat');
  const later = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const onAction = (a: PlanAction) => {
    if (a.kind === 'code') setJoining(true);
    else if (a.kind === 'open-ai') openAi();
    // "Voltar ao PRO": a oferta da loja está logo abaixo; nada a abrir.
  };

  if (plano.isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (plano.isError || !view) {
    return (
      <Screen>
        <ErrorState error={plano.error} onRetry={() => void plano.refetch()} />
      </Screen>
    );
  }

  const p = plano.data;
  const free = view.offer !== null;

  return (
    <>
      <Screen onRefresh={() => void plano.refetch()} refreshing={plano.isRefetching}>
        <View className="gap-5 px-5 pb-8 pt-2">
          {free ? <ProHero /> : null}

          {/* Free: a oferta já explica; o cartão de estado é para quem tem ou teve PRO. */}
          {free && p.state === 'FREE' ? null : (
            <PlanStatusCard
              view={view}
              highlight={recurso}
              onAction={(a) => (a.kind === 'subscribe' ? undefined : onAction(a))}
            />
          )}

          {view.offer === 'store' ? (
            pacotes.isPending ? (
              <LoadingState label="Buscando os planos da loja…" />
            ) : (
              <StoreOffer
                packages={pacotes.data ?? []}
                trialEligible={p.trialEligible}
                buying={assinar.isPending}
                onBuy={(pkg) => assinar.mutate(pkg)}
                onTrial={setTrial}
                restoring={restaurar.isPending}
                onRestore={() => restaurar.mutate()}
                onCode={() => setJoining(true)}
                onLater={later}
              />
            )
          ) : null}

          {view.offer === 'community' ? (
            <CommunityOffer
              text={PRO_VIA_COMMUNITY}
              onCode={() => setJoining(true)}
              onLater={later}
            />
          ) : null}

          <Text className="text-center text-xs text-muted-foreground">
            Livre em qualquer plano: registro manual, metas e conquistas, sua própria IA pelo MCP,
            exportar e apagar seus dados.
          </Text>

          {erro ? (
            <Text accessibilityRole="alert" className="text-center text-sm text-destructive">
              {erro}
            </Text>
          ) : null}
        </View>
      </Screen>

      {/* Sem a camada o sheet não tem onde abrir e fica invisível (ver `ui/drawer.tsx`). */}
      <DrawerLayer>
        <TrialDrawer
          open={trial !== null}
          onOpenChange={(open) => !open && setTrial(null)}
          days={trial?.days ?? 0}
          price={trial?.price ?? ''}
          buying={assinar.isPending}
          done={bought}
          onStart={() => trial && assinar.mutate(trial.pkg)}
          onOpenAi={() => {
            setTrial(null);
            openAi();
          }}
        />
        <JoinByCodeDrawer
          open={joining}
          onOpenChange={setJoining}
          onJoined={(groupId) => {
            void qc.invalidateQueries({ queryKey: ['billing', 'plan'] });
            router.push(`/community/${groupId}`);
          }}
        />
      </DrawerLayer>
    </>
  );
}
