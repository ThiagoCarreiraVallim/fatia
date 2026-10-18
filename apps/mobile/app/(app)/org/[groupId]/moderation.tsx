import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  moderationApi,
  orgApi,
  POST_POLICY_LABEL,
  relativeTime,
  REPORT_REASON_LABEL,
  reportSummary,
  type MyGroup,
  type PostPolicy,
  type ReportQueueItem,
} from '@fatia/api-client';
import { apiMessage, Choice, OrgPanel, PanelCard } from '@/components/org/org-panel';
import { Button, EmptyState, LoadingState } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

const chave = (groupId: string) => ['community', 'org', groupId, 'moderation'] as const;

function Moderacao({ g }: { g: MyGroup }) {
  const qc = useQueryClient();
  const toast = useToast();
  const fila = useQuery({
    queryKey: [...chave(g.id), 'reports'],
    queryFn: () => moderationApi.reports(g.id),
  });
  const removidos = useQuery({
    queryKey: [...chave(g.id), 'removed'],
    queryFn: () => moderationApi.removed(g.id),
  });
  const banidos = useQuery({
    queryKey: [...chave(g.id), 'bans'],
    queryFn: () => moderationApi.bans(g.id),
  });
  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: chave(g.id) });
    void qc.invalidateQueries({ queryKey: ['community', 'feed', g.id] });
  };
  const erro = (padrao: string) => (err: unknown) =>
    toast.show({ message: apiMessage(err, padrao) });

  const politica = useMutation({
    mutationFn: (postPolicy: PostPolicy) => orgApi.update(g.id, { postPolicy }),
    onSuccess: () => {
      toast.show({ message: 'Regra do mural salva.' });
      void qc.invalidateQueries({ queryKey: ['community', 'group', g.id] });
      void qc.invalidateQueries({ queryKey: ['community', 'feed', g.id] });
    },
    onError: erro('Não deu para salvar agora.'),
  });
  const resolver = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'remove' | 'dismiss' }) =>
      moderationApi.resolve(g.id, id, action),
    onSuccess: (_, { action }) => {
      toast.show({
        message:
          action === 'remove' ? 'Removido do mural.' : 'Denúncia descartada. O post continua.',
      });
      recarregar();
    },
    onError: erro('Não deu para resolver agora.'),
  });
  const restaurar = useMutation({
    mutationFn: (id: string) => moderationApi.restorePost(g.id, id),
    onSuccess: () => {
      toast.show({ message: 'Post de volta ao mural.' });
      recarregar();
    },
    onError: erro('Não deu para restaurar agora.'),
  });
  const ban = useMutation({
    mutationFn: (membershipId: string) => moderationApi.ban(g.id, membershipId),
    onSuccess: () => {
      toast.show({ message: 'Pessoa banida. Ela saiu da comunidade e não entra de novo.' });
      recarregar();
    },
    onError: erro('Não deu para banir agora.'),
  });
  const desbanir = useMutation({
    mutationFn: (membershipId: string) => moderationApi.unban(g.id, membershipId),
    onSuccess: () => {
      toast.show({ message: 'Banimento desfeito. A pessoa pode pedir para entrar de novo.' });
      recarregar();
    },
    onError: erro('Não deu para desfazer agora.'),
  });

  const confirmarBan = (item: ReportQueueItem) =>
    Alert.alert(
      `Banir ${item.author.displayName}?`,
      'A pessoa sai da comunidade, a equipe perde o acesso ao que ela compartilhava, e o código e os convites não a deixam voltar.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Banir',
          style: 'destructive',
          onPress: () => ban.mutate(item.author.membershipId),
        },
      ],
    );

  if (fila.isPending) return <LoadingState />;

  return (
    <>
      <PanelCard title="Quem publica no mural">
        <Choice
          label=""
          options={(['ALL_MEMBERS', 'TEAM_ONLY'] as const).map((p) => ({
            value: p,
            label: POST_POLICY_LABEL[p],
          }))}
          value={g.postPolicy}
          onChange={(p) => p !== g.postPolicy && politica.mutate(p)}
        />
        <Text className="text-xs text-muted-foreground">
          Reagir, comentar e denunciar fica aberto a todos os membros nas duas opções.
        </Text>
      </PanelCard>

      <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
        Denúncias
      </Text>
      {(fila.data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhuma denúncia aberta"
          description="Quando alguém denunciar um post ou comentário, aparece aqui, sem o nome de quem denunciou."
        />
      ) : (
        (fila.data ?? []).map((item) => (
          <PanelCard key={item.reportId}>
            <Text className="text-xs font-semibold text-destructive">{reportSummary(item)}</Text>
            <Text className="text-xs text-muted-foreground">
              {`${item.commentId ? 'Comentário' : 'Post'} de ${item.author.displayName}${
                item.author.team ? ' (equipe)' : ''
              } · ${relativeTime(item.firstReportedAt)}`}
            </Text>
            <Text className="text-sm text-foreground">{item.excerpt || '(só imagens)'}</Text>
            {item.notes.map((n, i) => (
              <Text key={i} className="text-xs text-muted-foreground">{`“${n}”`}</Text>
            ))}
            <View className="flex-row flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={resolver.isPending}
                onPress={() => resolver.mutate({ id: item.reportId, action: 'remove' })}
              >
                Remover
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={resolver.isPending}
                onPress={() => resolver.mutate({ id: item.reportId, action: 'dismiss' })}
              >
                Manter
              </Button>
              {!item.author.team ? (
                <Button size="sm" variant="ghost" onPress={() => confirmarBan(item)}>
                  {`Banir ${item.author.displayName}`}
                </Button>
              ) : null}
            </View>
          </PanelCard>
        ))
      )}

      <PanelCard title="Removidos nos últimos 30 dias">
        {(removidos.data ?? []).length === 0 ? (
          <Text className="text-xs text-muted-foreground">Nada removido.</Text>
        ) : (
          (removidos.data ?? []).map((p) => (
            <View key={p.id} className="gap-1">
              <Text className="text-sm text-foreground" numberOfLines={2}>
                {p.excerpt || '(só imagens)'}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {`${p.author.displayName} · ${
                  p.reason ? REPORT_REASON_LABEL[p.reason] : 'sem motivo'
                } · ${relativeTime(p.removedAt)}`}
              </Text>
              <Button size="sm" variant="outline" onPress={() => restaurar.mutate(p.id)}>
                Restaurar
              </Button>
            </View>
          ))
        )}
      </PanelCard>

      <PanelCard title="Banidos">
        {(banidos.data ?? []).length === 0 ? (
          <Text className="text-xs text-muted-foreground">Ninguém banido.</Text>
        ) : (
          (banidos.data ?? []).map((b) => (
            <View key={b.membershipId} className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-sm text-foreground">
                {b.displayName ? `${b.name} · ${b.displayName}` : b.name}
              </Text>
              <Button size="sm" variant="outline" onPress={() => desbanir.mutate(b.membershipId)}>
                Desfazer
              </Button>
            </View>
          ))
        )}
      </PanelCard>
    </>
  );
}

/** Equivalente de `apps/web/src/app/(org)/org/[groupId]/moderation/page.tsx`. */
export default function OrgModerationScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <OrgPanel groupId={groupId}>{(g) => <Moderacao g={g} />}</OrgPanel>;
}
