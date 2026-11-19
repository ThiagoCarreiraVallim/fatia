import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  challengeSections,
  challengesApi,
  type Challenge,
  type ChallengeList,
} from '@fatia/api-client';
import { ChallengeCard } from '@/components/challenges/challenge-ui';
import { challengeListKey } from '@/components/challenges/join-challenge-drawer';
import { CommunityTabs } from '@/components/community/community-tabs';
import { Screen } from '@/components/layout/screen';
import { apiMessage } from '@/components/org/org-panel';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text accessibilityRole="header" className="px-1 text-eb uppercase text-muted-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}

/**
 * Desafios da comunidade (Cm-08), espelho de
 * `apps/web/src/app/(app)/community/[groupId]/challenges/page.tsx`: "Você
 * participa", "Para olhar", "Próximo" e "Encerrados".
 */
export default function CommunityChallengesScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({
    queryKey: challengeListKey(groupId),
    queryFn: () => challengesApi.list(groupId),
  });

  const watch = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => challengesApi.watch(groupId, id, on),
    onSuccess: ({ watching }, { id }) => {
      qc.setQueryData<ChallengeList>(challengeListKey(groupId), (old) =>
        old
          ? {
              ...old,
              challenges: old.challenges.map((c) => (c.id === id ? { ...c, watching } : c)),
            }
          : old,
      );
      toast.show({
        message: watching ? 'Você recebe um aviso quando o desafio começar.' : 'Aviso desligado.',
      });
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para mudar o aviso agora.') }),
  });

  const open = (id: string) => router.push(`/community/${groupId}/challenges/${id}`);
  const join = (id: string) => router.push(`/community/${groupId}/challenges/${id}?join=1`);
  const checkin = (id: string) => router.push(`/community/${groupId}/challenges/${id}/checkin`);

  const card = (c: Challenge) => (
    <ChallengeCard
      key={c.id}
      challenge={c}
      onOpen={() => open(c.id)}
      onCheckin={() => checkin(c.id)}
      onJoin={c.status === 'ended' ? undefined : () => join(c.id)}
      onWatch={(on) => watch.mutate({ id: c.id, on })}
      watchPending={watch.isPending && watch.variables?.id === c.id}
    />
  );

  return (
    <Screen onRefresh={() => void list.refetch()} refreshing={list.isRefetching}>
      <View className="gap-4 px-5 pb-6 pt-4">
        <CommunityTabs groupId={groupId} />
        <Text className="px-1 text-xs text-muted-foreground">
          Participar é opcional. Desafios contam constância: treino com foto, água, passos, proteína
          ou pontos somando tudo. Peso e medidas nunca contam.
        </Text>

        {list.isPending ? <LoadingState label="Carregando os desafios…" /> : null}
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : null}
        {list.data && list.data.challenges.length === 0 ? (
          <EmptyState
            title="Nenhum desafio ainda"
            description="Quando a equipe marcar um desafio, ele aparece aqui."
          />
        ) : null}

        {list.data
          ? (() => {
              const s = challengeSections(list.data.challenges);
              return (
                <>
                  {s.mine.length ? (
                    <Section title="Você participa">{s.mine.map(card)}</Section>
                  ) : null}
                  {s.browse.length ? (
                    <Section title="Para olhar">{s.browse.map(card)}</Section>
                  ) : null}
                  {s.upcoming.length ? (
                    <Section title={s.upcoming.length === 1 ? 'Próximo' : 'Próximos'}>
                      {s.upcoming.map(card)}
                    </Section>
                  ) : null}
                  {s.ended.length ? (
                    <Section title="Encerrados">{s.ended.map(card)}</Section>
                  ) : null}
                </>
              );
            })()
          : null}
      </View>
    </Screen>
  );
}
