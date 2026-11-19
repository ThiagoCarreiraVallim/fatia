import { Pressable, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react-native';
import { feedApi, pollFooter, type PollView, type Post } from '@fatia/api-client';
import { apiMessage } from '@/components/org/org-panel';
import { Button, cn } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { colors } from '@/theme/colors';
import { feedKey } from './feed-keys';

/**
 * A enquete no mural (pranchas Cm-21 a 21d) — equivalente de
 * `apps/web/src/components/feed/poll-block.tsx`. Com menos de 5 votos a API
 * não manda nem o total, e a tela diz por quê.
 */
export function PollBlock({
  groupId,
  post,
  poll,
}: {
  groupId: string;
  post: Post;
  poll: PollView;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const recarregar = () => void qc.invalidateQueries({ queryKey: feedKey(groupId) });
  const votar = useMutation({
    mutationFn: (optionId: string) => feedApi.vote(groupId, post.id, optionId),
    onSuccess: recarregar,
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para votar agora.') }),
  });
  const encerrar = useMutation({
    mutationFn: () => feedApi.closePoll(groupId, post.id),
    onSuccess: () => {
      toast.show({ message: 'Enquete encerrada.' });
      recarregar();
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para encerrar agora.') }),
  });
  const votando = !poll.closed && !poll.myOptionId;
  const ocupado = votar.isPending || encerrar.isPending;

  return (
    <View className="gap-3" accessibilityLabel={`Enquete: ${poll.question}`}>
      <Text className="font-semibold text-foreground">{poll.question}</Text>
      <View className="gap-2">
        {poll.options.map((o) => {
          const minha = poll.myOptionId === o.id;
          if (votando) {
            return (
              <Pressable
                key={o.id}
                accessibilityRole="button"
                disabled={ocupado}
                onPress={() => votar.mutate(o.id)}
                className="min-h-[44px] justify-center rounded-xl border border-border px-3"
              >
                <Text className="text-sm text-foreground">{o.label}</Text>
              </Pressable>
            );
          }
          // Votou e está aberta: tocar em outra opção troca o voto (o voto não se apaga).
          const troca = !poll.closed && !minha;
          return (
            <Pressable
              key={o.id}
              accessibilityRole={poll.closed ? undefined : 'button'}
              accessibilityState={poll.closed ? undefined : { selected: minha }}
              disabled={!troca || ocupado}
              onPress={() => troca && votar.mutate(o.id)}
              accessibilityLabel={`${o.label}${o.percent !== null ? `, ${o.percent}%` : ''}${minha ? ', seu voto' : ''}`}
              className={cn(
                'min-h-[44px] justify-center overflow-hidden rounded-xl border px-3',
                minha ? 'border-primary' : 'border-border',
              )}
            >
              {o.percent !== null ? (
                <View
                  className="absolute inset-y-0 left-0 bg-primary/15"
                  style={{ width: `${o.percent}%` }}
                />
              ) : null}
              <View className="flex-row items-center justify-between gap-2">
                <Text className={cn('text-sm text-foreground', minha && 'font-semibold')}>
                  {o.label}
                </Text>
                {o.percent !== null ? (
                  <Text className="text-sm text-muted-foreground">{`${o.percent}%`}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text className="text-xs text-muted-foreground">{pollFooter(poll)}</Text>
      <View className="flex-row items-center gap-1">
        <Lock size={12} color={colors.mutedForeground} />
        <Text className="flex-1 text-xs text-muted-foreground">
          Seu voto é anônimo · Ninguém vê em quem você votou, nem a equipe.
        </Text>
      </View>
      {!poll.closed && poll.myOptionId ? (
        <Text className="text-xs text-muted-foreground">
          Para mudar o voto, toque em outra opção.
        </Text>
      ) : null}
      {!poll.closed && poll.canClose ? (
        <Button size="sm" variant="ghost" disabled={ocupado} onPress={() => encerrar.mutate()}>
          Encerrar enquete
        </Button>
      ) : null}
    </View>
  );
}
