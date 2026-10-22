import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatBRL,
  invoiceStatusLabel,
  poolStatusLabel,
  seatSummary,
  seatsApi,
  type MyGroup,
} from '@fatia/api-client';
import { apiMessage, OrgPanel, orgKeys, PanelCard } from '@/components/org/org-panel';
import { Button, ErrorState, LoadingState, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

const dia = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(iso))
    .replace('.', '');

/**
 * Assentos no app: ver, quem usa, tirar e as faturas. Comprar, mudar a
 * quantidade e cancelar ficam na web — pagamento fora da loja dentro do app
 * esbarra nas regras da App Store e do Google Play, e não há link de compra aqui.
 */
function Assentos({ g }: { g: MyGroup }) {
  const qc = useQueryClient();
  const toast = useToast();
  const visao = useQuery({ queryKey: orgKeys.seats(g.id), queryFn: () => seatsApi.get(g.id) });
  const faturas = useQuery({
    queryKey: orgKeys.invoices(g.id),
    queryFn: () => seatsApi.invoices(g.id),
  });
  const tirar = useMutation({
    mutationFn: (membershipId: string) => seatsApi.unassign(g.id, membershipId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: orgKeys.all(g.id) }),
    onError: (err) =>
      toast.show({ message: apiMessage(err, 'Não deu para tirar o assento agora.') }),
  });

  if (visao.isPending) return <LoadingState label="Carregando os assentos…" />;
  if (visao.isError) return <ErrorState error={visao.error} onRetry={() => void visao.refetch()} />;
  const v = visao.data;
  const pool = v.pool;
  const vivo = pool && pool.status !== 'CANCELED' && pool.status !== 'EXPIRED';

  return (
    <>
      <PanelCard title="Assentos PRO">
        <Text className="text-lg font-bold text-foreground">{seatSummary(v)}</Text>
        {vivo && pool ? (
          <View className="gap-1">
            <Text className="text-sm text-muted-foreground">{poolStatusLabel(pool.status)}</Text>
            {pool.manual ? (
              <Text className="text-sm text-muted-foreground">Cortesia: sem cobrança.</Text>
            ) : null}
            {pool.currentPeriodEnd && !pool.manual ? (
              <Text className="text-sm text-muted-foreground">
                {pool.cancelAtPeriodEnd
                  ? `Cancelados: valem até ${dia(pool.currentPeriodEnd)}.`
                  : `Próxima cobrança em ${dia(pool.currentPeriodEnd)}.`}
              </Text>
            ) : null}
          </View>
        ) : null}
        <Text className="text-xs text-muted-foreground">
          {`Cada assento dá o PRO a um membro escolhido por você (${formatBRL(v.unitPriceCents)} por mês). A compra, a quantidade e o cancelamento ficam no painel pela web; aqui você dá e tira assentos, em Membros.`}
        </Text>
      </PanelCard>

      <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
        Quem usa
      </Text>
      {v.assignments.length === 0 ? (
        <Text className="text-xs text-muted-foreground">
          {vivo ? 'Ninguém ainda.' : 'Sem assentos ativos.'}
        </Text>
      ) : (
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          {v.assignments.map((a, i) => (
            <View
              key={a.membershipId}
              className={cn(
                'flex-row items-center gap-3 px-4 py-3',
                i < v.assignments.length - 1 && 'border-b border-border',
              )}
            >
              <View className="flex-1">
                <Text className="text-sm text-foreground">{a.name}</Text>
                {a.ownPro ? (
                  <Text className="text-xs text-muted-foreground">Já paga o próprio PRO.</Text>
                ) : null}
              </View>
              <Button
                size="sm"
                variant="ghost"
                accessibilityLabel={`Tirar o assento de ${a.name}`}
                onPress={() => tirar.mutate(a.membershipId)}
              >
                Tirar
              </Button>
            </View>
          ))}
        </View>
      )}

      <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
        Faturas
      </Text>
      {faturas.data && faturas.data.length === 0 ? (
        <Text className="text-xs text-muted-foreground">Nenhuma fatura ainda.</Text>
      ) : null}
      {faturas.data && faturas.data.length > 0 ? (
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          {faturas.data.map((f, i) => (
            <View
              key={f.id}
              className={cn(
                'flex-row items-center justify-between px-4 py-3',
                i < faturas.data.length - 1 && 'border-b border-border',
              )}
            >
              <View>
                <Text className="text-sm text-foreground">
                  {f.dueDate ? dia(f.dueDate) : dia(f.createdAt)}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {`${f.kind === 'ADJUSTMENT' ? 'Proporcional' : 'Mensalidade'} · ${invoiceStatusLabel(f.status)}`}
                </Text>
              </View>
              <Text className="text-sm text-foreground">{formatBRL(f.amountCents)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

/** Equivalente (parcial, sem compra) de `apps/web/src/app/(org)/org/[groupId]/seats/page.tsx`. */
export default function OrgSeatsScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <OrgPanel groupId={groupId}>{(g) => <Assentos g={g} />}</OrgPanel>;
}
