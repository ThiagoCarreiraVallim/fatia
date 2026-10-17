import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Check, Crown, Lock } from 'lucide-react-native';
import {
  billingApi,
  FREE_INCLUDES,
  planSummary,
  PRO_BENEFITS,
  usersApi,
  type ProFeature,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, cn, ErrorState, LoadingState } from '@/components/ui';
import {
  comprar,
  compraNoAppDisponivel,
  entrarNaLoja,
  pacotesDoPro,
  restaurarCompras,
  type PurchasesPackage,
} from '@/billing/purchases';
import { mensagemDeErro } from '@/components/nutrition/helpers';
import { cores } from '@/theme/cores';

/**
 * "Meu plano" no app (ADR 024): Free ou PRO, e a compra do PRO pela loja.
 *
 * Réplica de `apps/web/src/app/(app)/plan/page.tsx`, com uma diferença de
 * propósito: aqui a compra é **só** pela App Store / Google Play (regra das
 * lojas). Quem assinou pela web vê o plano e gerencia pela web, sem link de
 * compra externa.
 */
export default function PlanScreen() {
  const { recurso } = useLocalSearchParams<{ recurso?: ProFeature }>();
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);

  const plano = useQuery({ queryKey: ['billing', 'plan'], queryFn: () => billingApi.plan() });
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const podeComprar =
    compraNoAppDisponivel() &&
    plano.data?.tier === 'FREE' &&
    plano.data.requiresPlan &&
    Boolean(me.data?.id);

  const pacotes = useQuery({
    queryKey: ['billing', 'store-packages', me.data?.id],
    queryFn: async () => {
      await entrarNaLoja(me.data!.id);
      return pacotesDoPro();
    },
    enabled: podeComprar,
    staleTime: 10 * 60_000,
  });

  const atualizar = (novo: Awaited<ReturnType<typeof billingApi.plan>>) => {
    qc.setQueryData(['billing', 'plan'], novo);
    // O cadeado da foto e do menu dependem do plano.
    void qc.invalidateQueries({ queryKey: ['nutrition', 'photo-recognition'] });
  };

  const assinar = useMutation({
    mutationFn: async (pacote: PurchasesPackage) => {
      const comprou = await comprar(pacote);
      return comprou ? billingApi.revenueCatSync() : null;
    },
    onMutate: () => setErro(null),
    onSuccess: (novo) => novo && atualizar(novo),
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  const restaurar = useMutation({
    mutationFn: async () => {
      await entrarNaLoja(me.data!.id);
      await restaurarCompras();
      return billingApi.revenueCatSync();
    },
    onMutate: () => setErro(null),
    onSuccess: atualizar,
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  if (plano.isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (plano.isError) {
    return (
      <Screen>
        <ErrorState error={plano.error} onRetry={() => void plano.refetch()} />
      </Screen>
    );
  }

  const p = plano.data;
  const pro = p.tier === 'PRO';

  return (
    <Screen onRefresh={() => void plano.refetch()} refreshing={plano.isRefetching}>
      <View className="gap-5 px-5 pb-4 pt-2">
        <View className="rounded-2xl border border-border bg-card p-4">
          <View className="flex-row items-center gap-2">
            <Text
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-bold',
                pro ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
              )}
            >
              {pro ? 'PRO' : 'FREE'}
            </Text>
            <Text
              accessibilityRole="header"
              className="flex-1 text-lg font-extrabold text-foreground"
            >
              {planSummary(p)}
            </Text>
          </View>
          {p.source === 'ASAAS' && pro ? (
            <Text className="mt-2 text-sm text-muted-foreground">
              Assinatura feita pela web. Para cancelar ou trocar o plano, entre no Fatia pelo
              navegador.
            </Text>
          ) : null}
          {p.source === 'GROUP' ? (
            <Text className="mt-2 text-sm text-muted-foreground">
              {p.groupName
                ? `A comunidade ${p.groupName} paga seu PRO.`
                : 'A comunidade paga seu PRO.'}{' '}
              Se ela retirar o assento, você volta ao Free sem perder nenhum registro.
            </Text>
          ) : null}
          {p.manageUrl ? (
            <Button
              variant="outline"
              className="mt-3"
              onPress={() => void Linking.openURL(p.manageUrl!)}
              accessibilityLabel="Gerenciar assinatura na loja"
            >
              Gerenciar na loja
            </Button>
          ) : null}
        </View>

        <View className="gap-2">
          <Text className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            O PRO acrescenta
          </Text>
          <View className="overflow-hidden rounded-2xl border border-border bg-card">
            {PRO_BENEFITS.map((b, i) => (
              <View
                key={b.key}
                className={cn(
                  'flex-row items-center gap-3 px-4 py-3',
                  i < PRO_BENEFITS.length - 1 && 'border-b border-border',
                  recurso === b.key && 'bg-primary/10',
                )}
              >
                {pro ? (
                  <Check size={18} color={cores.primary} />
                ) : (
                  <Lock size={18} color={cores.mutedForeground} />
                )}
                <View className="flex-1">
                  <Text className="text-base font-bold text-foreground">{b.title}</Text>
                  <Text className="text-xs text-muted-foreground">{b.text}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Livre em qualquer plano
          </Text>
          <View className="gap-2 rounded-2xl border border-border bg-card p-4">
            {FREE_INCLUDES.map((item) => (
              <View key={item} className="flex-row items-start gap-2">
                <Check size={16} color={cores.primary} />
                <Text className="flex-1 text-sm text-foreground">{item}</Text>
              </View>
            ))}
          </View>
        </View>

        {!pro && p.requiresPlan ? (
          <View className="gap-3">
            {!compraNoAppDisponivel() ? (
              <Text className="text-center text-sm text-muted-foreground">
                A assinatura não está disponível nesta versão do app.
              </Text>
            ) : pacotes.isPending ? (
              <LoadingState label="Buscando os planos da loja…" />
            ) : pacotes.isError || (pacotes.data?.length ?? 0) === 0 ? (
              <Text className="text-center text-sm text-muted-foreground">
                Não foi possível carregar os planos da loja agora.
              </Text>
            ) : (
              pacotes.data!.map((pacote) => (
                <Pressable
                  key={pacote.identifier}
                  accessibilityRole="button"
                  accessibilityLabel={`Assinar ${pacote.product.title} por ${pacote.product.priceString}`}
                  disabled={assinar.isPending}
                  onPress={() => assinar.mutate(pacote)}
                  className="min-h-[56px] flex-row items-center gap-3 rounded-2xl bg-primary px-4 py-3 active:opacity-80"
                >
                  <Crown size={20} color={cores.background} />
                  <View className="flex-1">
                    <Text className="text-base font-bold text-primary-foreground">
                      {pacote.packageType === 'ANNUAL' ? 'PRO anual' : 'PRO mensal'}
                    </Text>
                    <Text className="text-xs text-primary-foreground">
                      {pacote.product.priceString}
                      {pacote.packageType === 'ANNUAL' ? ' por ano' : ' por mês'}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
            {compraNoAppDisponivel() ? (
              <Button
                variant="ghost"
                loading={restaurar.isPending}
                onPress={() => restaurar.mutate()}
              >
                Restaurar compras
              </Button>
            ) : null}
            <Text className="text-center text-xs text-muted-foreground">
              A assinatura renova sozinha e pode ser cancelada a qualquer momento na loja.
            </Text>
          </View>
        ) : null}

        {!p.requiresPlan ? (
          <Text className="text-center text-sm text-muted-foreground">
            Nesta instância a IA do Fatia é liberada para todos.
          </Text>
        ) : null}

        {erro ? (
          <Text accessibilityRole="alert" className="text-center text-sm text-destructive">
            {erro}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
