import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  challengePeriod,
  challengesApi,
  DISPLAY_NAME_MAX,
  displayNameProblem,
  METRIC_INFO,
  participantsLabel,
  rankLabel,
  scoreLabel,
  type ChallengeDetail,
} from '@fatia/api-client';
import {
  ChallengeStatusBadge,
  Leaderboard,
  MedalBadge,
} from '@/components/challenges/challenge-ui';
import { Screen } from '@/components/layout/screen';
import { apiMessage } from '@/components/org/org-panel';
import { Button, EmptyState, Input, LoadingState } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

const chave = (groupId: string, id: string) => ['community', 'challenges', groupId, id] as const;

function Entrar({
  desafio,
  pending,
  onCancel,
  onConfirm,
}: {
  desafio: ChallengeDetail;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (apelido: string) => void;
}) {
  const [apelido, setApelido] = useState(desafio.suggestedDisplayName);
  const problema = displayNameProblem(apelido);
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
        Como aparecer no ranking
      </Text>
      <Input
        value={apelido}
        onChangeText={setApelido}
        maxLength={DISPLAY_NAME_MAX}
        accessibilityLabel="Como aparecer no ranking"
      />
      <Text className="text-xs text-muted-foreground">
        Os outros participantes veem seu apelido e sua pontuação. Vale para os próximos desafios
        desta comunidade também.
      </Text>
      {METRIC_INFO[desafio.metric].usesOwnGoal ? (
        <Text className="rounded-xl bg-muted p-3 text-xs text-foreground">
          Conta pela sua meta de nutrição, sem mostrar quanto você comeu. Sem meta definida, os dias
          não contam: confira em Nutrição › Metas.
        </Text>
      ) : null}
      {problema ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {problema}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <Button variant="ghost" className="flex-1" onPress={onCancel}>
          Cancelar
        </Button>
        <Button
          className="flex-1"
          disabled={Boolean(problema)}
          loading={pending}
          onPress={() => onConfirm(apelido.trim())}
        >
          Participar
        </Button>
      </View>
    </View>
  );
}

/** Equivalente de `apps/web/src/app/(app)/community/[groupId]/challenges/[challengeId]/page.tsx`. */
export default function CommunityChallengeScreen() {
  const { groupId, challengeId } = useLocalSearchParams<{ groupId: string; challengeId: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const [entrando, setEntrando] = useState(false);

  const desafio = useQuery({
    queryKey: chave(groupId, challengeId),
    queryFn: () => challengesApi.get(groupId, challengeId),
    retry: false,
  });
  const lista = () =>
    void qc.invalidateQueries({ queryKey: ['community', 'challenges', groupId], exact: true });

  const entrar = useMutation({
    mutationFn: (apelido: string) => challengesApi.join(groupId, challengeId, apelido),
    onSuccess: (d) => {
      qc.setQueryData(chave(groupId, challengeId), d);
      lista();
      setEntrando(false);
      toast.show({ message: 'Você entrou no desafio.' });
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para entrar agora.') }),
  });
  const sair = useMutation({
    mutationFn: () => challengesApi.leave(groupId, challengeId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chave(groupId, challengeId) });
      lista();
      toast.show({ message: 'Você saiu do desafio.' });
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para sair agora.') }),
  });

  if (desafio.isPending) {
    return (
      <Screen>
        <LoadingState label="Carregando o desafio…" />
      </Screen>
    );
  }
  if (!desafio.data) {
    return (
      <Screen>
        <View className="px-5 pt-4">
          <EmptyState
            title="Desafio não encontrado"
            description="Ele pode ter sido apagado, ou você não está mais na comunidade."
          />
        </View>
      </Screen>
    );
  }
  const c = desafio.data;
  const info = METRIC_INFO[c.metric];
  const aberto = c.status !== 'ended';

  return (
    <Screen
      title={c.title}
      onRefresh={() => void desafio.refetch()}
      refreshing={desafio.isRefetching}
    >
      <View className="gap-4 px-5 pb-6 pt-4">
        <View className="gap-2">
          <View className="flex-row flex-wrap items-center gap-2">
            <ChallengeStatusBadge challenge={c} />
            <Text className="text-xs text-muted-foreground">
              {`${challengePeriod(c)} · ${participantsLabel(c.participants)}`}
            </Text>
          </View>
          <Text className="text-sm font-semibold text-foreground">{info.label}</Text>
          <Text className="text-sm text-muted-foreground">{info.explain}</Text>
          {c.description ? <Text className="text-sm text-foreground">{c.description}</Text> : null}
          {c.endedEarly ? (
            <Text className="text-xs text-muted-foreground">
              A equipe encerrou o desafio antes da data.
            </Text>
          ) : null}
        </View>

        {c.me ? (
          <View className="gap-1 rounded-2xl border border-border bg-card p-4">
            <Text className="text-xs font-semibold text-muted-foreground">
              {`Você, como ${c.me.displayName}`}
            </Text>
            <View className="flex-row flex-wrap items-center gap-3">
              <Text className="text-lg font-semibold text-foreground">
                {scoreLabel(c.metric, c.me.score)}
              </Text>
              {rankLabel(c.me.rank) ? (
                <Text className="text-sm text-muted-foreground">{rankLabel(c.me.rank)}</Text>
              ) : null}
              {c.me.medal ? <MedalBadge medal={c.me.medal} /> : null}
            </View>
          </View>
        ) : aberto ? (
          entrando ? (
            <Entrar
              desafio={c}
              pending={entrar.isPending}
              onCancel={() => setEntrando(false)}
              onConfirm={(apelido) => entrar.mutate(apelido)}
            />
          ) : (
            <View className="gap-3 rounded-2xl border border-border bg-card p-4">
              <Text className="text-sm text-foreground">
                O ranking aparece para quem participa. Os outros participantes veem seu apelido e
                sua pontuação, e nada além disso.
              </Text>
              <Button onPress={() => setEntrando(true)}>Participar</Button>
            </View>
          )
        ) : (
          <Text className="text-sm text-muted-foreground">
            Este desafio terminou. O ranking ficou para quem participou.
          </Text>
        )}

        {c.leaderboard ? (
          <View className="gap-2">
            <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">
              Ranking
            </Text>
            {c.status === 'upcoming' ? (
              <Text className="text-xs text-muted-foreground">
                A contagem começa no primeiro dia.
              </Text>
            ) : null}
            <Leaderboard challenge={c} entries={c.leaderboard} />
            {c.status === 'running' ? (
              <Text className="text-xs text-muted-foreground">Atualiza a cada poucos minutos.</Text>
            ) : null}
          </View>
        ) : null}

        {c.me && aberto ? (
          <Button
            variant="outline"
            loading={sair.isPending}
            onPress={() =>
              Alert.alert(
                'Sair do desafio?',
                'Seu apelido e sua pontuação saem do ranking. Dá para entrar de novo enquanto ele não acabar.',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Sair', style: 'destructive', onPress: () => sair.mutate() },
                ],
              )
            }
          >
            Sair do desafio
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}
