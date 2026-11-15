import { useEffect } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  alreadyMemberGroupId,
  ApiError,
  groupsApi,
  initialsOf,
  onboardingPending,
  teamRoleLabel,
  usersApi,
  type InvitePreview,
  type JoinConsent,
} from '@fatia/api-client';
import { useAuth } from '@/auth/auth-context';
import { isInviteToken } from '@/community/invite-link';
import { clearPendingInvite, savePendingInvite } from '@/community/pending-invite';
import { AccountForm } from '@/components/auth/account-form';
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
  const { status } = useAuth();
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

  // Conta nova (ou onboarding pela metade): o convite vira as boas-vindas e o
  // "o que a equipe vê" do onboarding (Onb-02 e Onb-03), não este cartão.
  const me = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => usersApi.me(),
    enabled: status === 'signedIn',
  });
  const toOnboarding = token !== null && me.data !== undefined && onboardingPending(me.data);
  useEffect(() => {
    if (toOnboarding) router.replace(`/onboarding?convite=${token}`);
  }, [toOnboarding, router, token]);

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
  if (preview.isPending || status === 'loading' || toOnboarding) {
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
          // Onb-01a · Conta pelo convite: quem convidou, a comunidade e a conta.
          <View className="gap-3.5">
            <View className="h-[150px] justify-end rounded-card bg-brand px-6 pb-[18px]">
              <View className="flex-row items-center gap-3">
                <View className="h-14 w-14 items-center justify-center rounded-[18px] border-[3px] border-black/25 bg-brand">
                  <Text className="font-display text-lg text-brand-foreground">
                    {initialsOf(preview.data.group.name)}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-[13px] font-bold text-brand-foreground/80">
                    {preview.data.invitedBy
                      ? `${preview.data.invitedBy} te convidou`
                      : 'Você foi convidado'}
                  </Text>
                  <Text className="font-display text-h2 text-brand-foreground">
                    {preview.data.group.name}
                  </Text>
                </View>
              </View>
            </View>
            <Text accessibilityRole="header" className="font-display text-[26px] text-foreground">
              Crie sua conta para entrar
            </Text>
            <AccountForm brandCta />
          </View>
        )}
      </View>
    </Screen>
  );
}
