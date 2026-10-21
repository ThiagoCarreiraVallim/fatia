import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  alreadyMemberGroupId,
  ApiError,
  groupsApi,
  teamRoleLabel,
  type InvitePreview,
  type JoinConsent,
} from '@fatia/api-client';
import { useAuth } from '@/auth/auth-context';
import { isInviteToken } from '@/community/invite-link';
import { clearPendingInvite, savePendingInvite } from '@/community/pending-invite';
import { ConsentForm } from '@/components/community/consent-form';
import { Screen } from '@/components/layout/screen';
import { Button, EmptyState, LoadingState } from '@/components/ui';

/** Inválido, vencido ou de outra conta: a mesma frase do PWA, sem dizer o motivo. */
const INDISPONIVEL =
  'Este convite não pode ser usado. Ele pode ter vencido, sido cancelado ou ser para outra conta.';

function CartaoDoConvite({ preview }: { preview: InvitePreview }) {
  const papel = teamRoleLabel(preview.role).toLowerCase();
  return (
    <View className="gap-2 rounded-2xl border border-border bg-card p-4">
      <Text accessibilityRole="header" className="text-xl font-extrabold text-foreground">
        {preview.group.name}
      </Text>
      <Text className="text-xs text-muted-foreground">
        {`${preview.memberCount} ${preview.memberCount === 1 ? 'membro' : 'membros'}`}
      </Text>
      {preview.group.description ? (
        <Text className="text-sm text-muted-foreground">{preview.group.description}</Text>
      ) : null}
      <Text className="text-sm text-foreground">
        {preview.invitedBy
          ? `${preview.invitedBy} convidou você para entrar como ${papel}.`
          : `Este convite é para entrar como ${papel}.`}
      </Text>
      {preview.emailBound ? (
        <Text className="text-xs text-muted-foreground">
          Este convite vale só para a conta do e-mail que o recebeu.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Equivalente de `apps/web/src/app/(invite)/c/[token]/page.tsx`, aberto por
 * `fatia://c/<token>` ou pelo link universal. Fora do `(app)`: quem ainda não tem
 * conta vê a comunidade e entra; o token fica guardado para o caso de o app ser
 * fechado no meio do login.
 */
export default function InviteScreen() {
  const { token: bruto } = useLocalSearchParams<{ token: string }>();
  const token = isInviteToken(bruto) ? bruto : null;
  const { status, signIn } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const preview = useQuery({
    queryKey: ['community', 'invite', token],
    queryFn: () => groupsApi.previewInvite(token!),
    enabled: token !== null,
    retry: false,
  });

  useEffect(() => {
    if (token && status === 'signedOut') void savePendingInvite(token);
  }, [token, status]);

  const accept = useMutation({
    mutationFn: (consent: JoinConsent) => groupsApi.acceptInvite(token!, consent),
    onSuccess: (r) => {
      void clearPendingInvite();
      void qc.invalidateQueries({ queryKey: ['community'] });
      router.replace(`/community/${r.groupId}`);
    },
    onError: (err) => {
      const groupId = alreadyMemberGroupId(err);
      if (groupId) {
        void clearPendingInvite();
        router.replace(`/community/${groupId}`);
      }
    },
  });

  if (token === null || preview.isError) {
    return (
      <Screen title="Convite">
        <View className="px-5 pt-4">
          <EmptyState title="Convite indisponível" description={INDISPONIVEL} />
        </View>
      </Screen>
    );
  }
  if (preview.isPending || status === 'loading') {
    return (
      <Screen title="Convite">
        <LoadingState label="Abrindo o convite…" />
      </Screen>
    );
  }

  const erro =
    accept.isError && !alreadyMemberGroupId(accept.error)
      ? accept.error instanceof ApiError && accept.error.isNotFound
        ? INDISPONIVEL
        : // 409 diz o que falta compartilhar, se o dono mudou a exigência
          // depois que o convite abriu.
          accept.error instanceof ApiError && accept.error.isConflict
          ? accept.error.message
          : 'Não deu para aceitar agora. Tente de novo.'
      : null;

  return (
    <Screen title="Convite">
      <View className="gap-5 px-5 pb-4 pt-4">
        <CartaoDoConvite preview={preview.data} />
        {status === 'signedIn' ? (
          <ConsentForm
            team={preview.data.team}
            required={preview.data.requiredSharingScopes}
            submitLabel="Aceitar e entrar"
            pending={accept.isPending}
            error={erro}
            onSubmit={(consent) => accept.mutate(consent)}
            secondary={
              <Button variant="ghost" onPress={() => router.replace('/')}>
                Agora não
              </Button>
            }
          />
        ) : (
          <View className="gap-3">
            <Text className="text-sm text-muted-foreground">
              Entre ou crie sua conta para aceitar. Depois você escolhe o que a equipe pode ver.
            </Text>
            <Button size="lg" onPress={() => void signIn()}>
              Entrar para aceitar
            </Button>
            <Button size="lg" variant="outline" onPress={() => void signIn('register')}>
              Criar conta grátis
            </Button>
          </View>
        )}
      </View>
    </Screen>
  );
}
