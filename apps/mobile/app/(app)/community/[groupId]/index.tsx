import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Crown, LayoutDashboard } from 'lucide-react-native';
import {
  ApiError,
  canOpenPanel,
  consentSummary,
  groupsApi,
  joinPolicyLabel,
  panelHref,
  SHARE_SCOPE_LABEL,
  teamRoleLabel,
  type JoinConsent,
} from '@fatia/api-client';
import { ConsentForm } from '@/components/community/consent-form';
import { GroupAvatar } from '@/components/community/group-avatar';
import { CommunityChallengesPreview } from '@/components/challenges/community-challenges-preview';
import { CommunityContentPreview } from '@/components/content/community-content-preview';
import { CommunityTabs } from '@/components/community/community-tabs';
import { Screen } from '@/components/layout/screen';
import { Button, EmptyState, ErrorState, LoadingState, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { cores } from '@/theme/cores';

const quando = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace('.', '');

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
        {titulo}
      </Text>
      {children}
    </View>
  );
}

/** Equivalente de `apps/web/src/app/(app)/community/[groupId]/page.tsx`. */
export default function CommunityDetailScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();

  const group = useQuery({
    queryKey: ['community', 'group', groupId],
    queryFn: () => groupsApi.get(groupId),
  });
  const ativo = group.data?.status === 'ACTIVE';
  const members = useQuery({
    queryKey: ['community', 'members', groupId],
    queryFn: () => groupsApi.members(groupId),
    enabled: ativo,
  });
  const log = useQuery({
    queryKey: ['community', 'access-log', groupId],
    queryFn: () => groupsApi.accessLog({ groupId, limit: 20 }),
    enabled: ativo,
  });

  const save = useMutation({
    mutationFn: (consent: JoinConsent) => groupsApi.setConsent(groupId, consent),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      toast.show({ message: `Compartilhando: ${consentSummary(r.scopes)}.` });
    },
  });
  const leave = useMutation({
    mutationFn: () => groupsApi.leave(groupId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      void qc.invalidateQueries({ queryKey: ['billing'] });
      router.replace('/community');
    },
  });

  if (group.isPending) {
    return (
      <Screen>
        <LoadingState label="Carregando a comunidade…" />
      </Screen>
    );
  }
  if (group.isError) {
    const sumiu = group.error instanceof ApiError && group.error.isNotFound;
    return (
      <Screen>
        <View className="px-5 pt-4">
          {sumiu ? (
            <EmptyState
              title="Comunidade não encontrada"
              description="Você não faz mais parte dela, ou ela não existe."
            />
          ) : (
            <ErrorState error={group.error} onRetry={() => void group.refetch()} />
          )}
        </View>
      </Screen>
    );
  }

  const g = group.data;
  const equipe = (members.data ?? []).filter((m) => m.role !== 'MEMBER');
  const confirmarSaida = () =>
    Alert.alert(
      ativo ? `Sair de ${g.name}?` : 'Cancelar o pedido?',
      ativo
        ? `A equipe perde o acesso ao que você compartilhava${g.hasAiSeat ? ', e o PRO pago pela comunidade acaba' : ''}. Seus registros continuam com você.`
        : 'Você pode pedir de novo depois, pelo código ou por um convite.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: ativo ? 'Sair' : 'Cancelar pedido',
          style: 'destructive',
          onPress: () => leave.mutate(),
        },
      ],
    );

  return (
    <Screen
      title={g.name}
      onRefresh={() => void Promise.all([group.refetch(), members.refetch(), log.refetch()])}
      refreshing={group.isRefetching}
    >
      <View className="gap-6 px-5 pb-4 pt-4">
        {ativo ? <CommunityTabs groupId={g.id} /> : null}
        <View className="flex-row items-start gap-3">
          <GroupAvatar name={g.name} url={g.avatarUrl} size={48} />
          <View className="flex-1 gap-1">
            {g.description ? (
              <Text className="text-sm text-foreground">{g.description}</Text>
            ) : null}
            <Text className="text-xs text-muted-foreground">
              {`${joinPolicyLabel(g.joinPolicy)} · seu papel: ${teamRoleLabel(g.role).toLowerCase()}`}
            </Text>
          </View>
        </View>

        {canOpenPanel(g) ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(panelHref(g.id))}
            className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4 active:opacity-80"
          >
            <LayoutDashboard size={20} color={cores.primary} />
            <View className="flex-1">
              <Text className="text-sm font-medium text-foreground">Abrir painel</Text>
              <Text className="text-xs text-muted-foreground">
                {g.role === 'OWNER'
                  ? 'Membros, convites, planos e dicas, assentos e números da comunidade.'
                  : 'Membros, o que compartilham com você, convites, planos e dicas.'}
              </Text>
            </View>
            <ChevronRight size={18} color={cores.mutedForeground} />
          </Pressable>
        ) : null}

        {!ativo ? (
          <Text className="rounded-2xl border border-border bg-card p-4 text-sm text-foreground">
            {`Seu pedido está aguardando o dono aprovar. O que você escolheu compartilhar (${consentSummary(g.consentScopes).toLowerCase()}) passa a valer quando você entrar.`}
          </Text>
        ) : null}

        {g.hasAiSeat ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/plan')}
            className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4 active:opacity-80"
          >
            <Crown size={20} color={cores.primary} />
            <View className="flex-1">
              <Text className="text-sm font-medium text-foreground">A comunidade paga seu PRO</Text>
              <Text className="text-xs text-muted-foreground">
                Chat, foto e ditado com a IA. Se o assento sair, você volta ao Free sem perder nada.
              </Text>
            </View>
          </Pressable>
        ) : null}

        {ativo ? <CommunityChallengesPreview groupId={g.id} /> : null}

        {ativo ? <CommunityContentPreview groupId={g.id} /> : null}

        {ativo ? (
          <Secao titulo="Equipe">
            {equipe.length === 0 ? (
              <Text className="text-xs text-muted-foreground">
                Ninguém da equipe, por enquanto.
              </Text>
            ) : (
              <View className="overflow-hidden rounded-2xl border border-border bg-card">
                {equipe.map((m, i) => (
                  <View
                    key={m.membershipId}
                    className={cn(
                      'flex-row justify-between px-4 py-3',
                      i < equipe.length - 1 && 'border-b border-border',
                    )}
                  >
                    <Text className="text-sm text-foreground">{m.name}</Text>
                    <Text className="text-xs text-muted-foreground">{teamRoleLabel(m.role)}</Text>
                  </View>
                ))}
              </View>
            )}
          </Secao>
        ) : null}

        {ativo ? (
          <Secao titulo="O que eu compartilho">
            <ConsentForm
              key={`${g.consentScopes.join()}|${g.statsOptIn}`}
              initial={{ scopes: g.consentScopes, statsOptIn: g.statsOptIn }}
              team={equipe}
              submitLabel="Salvar"
              editing
              pending={save.isPending}
              error={save.isError ? 'Não deu para salvar agora. Tente de novo.' : null}
              onSubmit={(consent) => save.mutate(consent)}
            />
          </Secao>
        ) : null}

        {ativo ? (
          <Secao titulo="Quem acessou seus dados">
            {log.data && log.data.length === 0 ? (
              <Text className="text-xs text-muted-foreground">
                Ninguém da equipe olhou seus dados ainda.
              </Text>
            ) : null}
            {log.data && log.data.length > 0 ? (
              <View className="overflow-hidden rounded-2xl border border-border bg-card">
                {log.data.map((linha, i) => (
                  <View
                    key={`${linha.at}-${i}`}
                    className={cn(
                      'flex-row justify-between gap-3 px-4 py-3',
                      i < log.data.length - 1 && 'border-b border-border',
                    )}
                  >
                    <View className="min-w-0 flex-1">
                      <Text className="text-sm text-foreground">
                        {linha.professionalName ?? 'Conta apagada'}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {linha.denied
                          ? `${SHARE_SCOPE_LABEL[linha.scope]} · barrado`
                          : SHARE_SCOPE_LABEL[linha.scope]}
                      </Text>
                    </View>
                    <Text className="text-xs text-muted-foreground">{quando(linha.at)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Secao>
        ) : null}

        {g.role === 'OWNER' ? (
          <Text className="text-xs text-muted-foreground">
            Quem é dono não sai da comunidade: transfira-a pelo painel, em Configurações.
          </Text>
        ) : (
          <Button variant="outline" loading={leave.isPending} onPress={confirmarSaida}>
            {ativo ? 'Sair da comunidade' : 'Cancelar pedido'}
          </Button>
        )}
      </View>
    </Screen>
  );
}
