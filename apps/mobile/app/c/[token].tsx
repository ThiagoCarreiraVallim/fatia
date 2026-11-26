import { useEffect } from 'react';
import { Image, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  alreadyMemberGroupId,
  ApiError,
  groupsApi,
  initialsOf,
  isTeamInvite,
  onboardingPending,
  TEAM_INVITE_ROLE,
  teamInviteDeclinedText,
  teamInviteHeadline,
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
import { Button, EmptyState, Icon, LoadingState } from '@/components/ui';
import { colors } from '@/theme/colors';
import { brandColors } from '@/components/ui/ds-math';
import { hexToHslTriplet } from '@fatia/design';
import { vars } from 'nativewind';

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
      // Equipe vai ao painel; o profissional passa antes pelo "O que você vê" (Onb-E2).
      const role = preview.data?.role ?? 'MEMBER';
      if (role === 'PROFESSIONAL') router.replace(`/org/${r.groupId}/what-you-see`);
      else if (isTeamInvite(role)) router.replace(`/org/${r.groupId}`);
      else router.replace(`/community/${r.groupId}`);
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
  if (status === 'signedIn' && isTeamInvite(preview.data.role)) {
    return (
      <TeamInvite
        token={token}
        preview={preview.data}
        pending={accept.isPending}
        error={erro}
        onAccept={() => accept.mutate({ scopes: [], statsOptIn: false })}
      />
    );
  }
  const marca = brandColors(preview.data.group.brandColor);
  const textoCapa = preview.data.group.coverUrl ? '#ffffff' : marca.foreground;

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
          <View
            className="gap-3.5"
            // O botão "Criar conta" (`bg-brand`) também sai na cor da comunidade.
            style={vars({
              '--brand': hexToHslTriplet(marca.background),
              '--brand-foreground': hexToHslTriplet(marca.foreground),
            })}
          >
            {/* A cor e a capa da comunidade (#413). Com capa, o texto vai em
                branco sobre um véu escuro, que garante o contraste. */}
            <View
              className="h-[150px] justify-end overflow-hidden rounded-card px-6 pb-[18px]"
              style={{ backgroundColor: marca.background }}
            >
              {preview.data.group.coverUrl ? (
                <>
                  <Image
                    source={{ uri: preview.data.group.coverUrl }}
                    accessibilityIgnoresInvertColors
                    className="absolute inset-0"
                    resizeMode="cover"
                  />
                  <View className="absolute inset-0 bg-black/50" />
                </>
              ) : null}
              <View className="flex-row items-center gap-3">
                <View
                  className="h-14 w-14 items-center justify-center rounded-[18px] border-[3px] border-black/25"
                  style={{ backgroundColor: marca.background }}
                >
                  <Text className="font-display text-lg" style={{ color: marca.foreground }}>
                    {initialsOf(preview.data.group.name)}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-[13px] font-bold opacity-80" style={{ color: textoCapa }}>
                    {preview.data.invitedBy
                      ? `${preview.data.invitedBy} te convidou`
                      : 'Você foi convidado'}
                  </Text>
                  <Text className="font-display text-h2" style={{ color: textoCapa }}>
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

/**
 * Convite da equipe (#372, prancha Onb-E1) — equivalente do
 * `TeamInviteAccept` da web: quem convidou, o papel e o que ele deixa fazer.
 * "Recusar" avisa quem convidou e o dono; o convite recusado não volta a valer.
 */
function TeamInvite({
  token,
  preview,
  pending,
  error,
  onAccept,
}: {
  token: string;
  preview: InvitePreview;
  pending: boolean;
  error: string | null;
  onAccept: () => void;
}) {
  const router = useRouter();
  const decline = useMutation({ mutationFn: () => groupsApi.declineInvite(token) });
  const papel = TEAM_INVITE_ROLE[preview.role];
  const marca = brandColors(preview.group.brandColor);

  if (decline.isSuccess) {
    return (
      <Screen title="Convite">
        <View className="items-center gap-3 px-5 pt-16">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Icon name="x" size={22} color={colors.foreground} />
          </View>
          <Text accessibilityRole="header" className="font-display text-2xl text-foreground">
            Convite recusado
          </Text>
          <Text className="text-center text-sm text-muted-foreground">
            {teamInviteDeclinedText(preview.invitedBy)}
          </Text>
          <Button variant="outline" onPress={() => router.replace('/')}>
            Ir para o início
          </Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="Convite"
      footer={
        <View
          className="flex-1 gap-2"
          style={vars({
            '--brand': hexToHslTriplet(marca.background),
            '--brand-foreground': hexToHslTriplet(marca.foreground),
          })}
        >
          <Button
            size="xl"
            variant="brand"
            loading={pending}
            disabled={decline.isPending}
            onPress={onAccept}
          >
            Aceitar e entrar
          </Button>
          <Button
            variant="text"
            disabled={pending}
            loading={decline.isPending}
            onPress={() => decline.mutate()}
          >
            Recusar
          </Button>
        </View>
      }
    >
      <View className="gap-4 px-5 pb-4 pt-2">
        <View
          className="h-[170px] justify-end overflow-hidden rounded-card px-6 pb-5"
          style={{ backgroundColor: marca.background }}
        >
          {preview.group.coverUrl ? (
            <Image
              source={{ uri: preview.group.coverUrl }}
              accessibilityIgnoresInvertColors
              className="absolute inset-0"
              resizeMode="cover"
            />
          ) : (
            // Sem capa, a cor escurecida: o logo na mesma cor precisa se destacar dela.
            <View className="absolute inset-0 bg-black/35" />
          )}
          <View
            className="h-[72px] w-[72px] items-center justify-center rounded-[22px] border-4 border-black/25"
            style={{ backgroundColor: marca.background }}
          >
            <Text className="font-display text-2xl" style={{ color: marca.foreground }}>
              {initialsOf(preview.group.name)}
            </Text>
          </View>
        </View>
        <View>
          <Text className="text-sm text-muted-foreground">
            {teamInviteHeadline(preview.invitedBy)}
          </Text>
          <Text accessibilityRole="header" className="font-display text-[30px] text-foreground">
            {preview.group.name}
          </Text>
        </View>
        {papel ? (
          <>
            <View className="flex-row items-center gap-3 rounded-card bg-card p-4">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-info/15">
                <Icon name="dumbbell" size={18} color={colors.info} />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-foreground">{papel.title}</Text>
                <Text className="text-[13px] text-muted-foreground">{papel.sub}</Text>
              </View>
              <View className="rounded-full bg-info/15 px-2.5 py-1">
                <Text className="text-[11px] font-bold uppercase text-info">Papel</Text>
              </View>
            </View>
            <View className="rounded-card bg-card">
              {papel.permissions.map((p, i) => (
                <View
                  key={p}
                  className={`flex-row items-center gap-3 px-4 py-3.5 ${i ? 'border-t border-border' : ''}`}
                >
                  <Icon name="check" size={18} color={colors.primaryText} />
                  <Text className="flex-1 text-[15px] text-foreground">{p}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
        {preview.emailBound ? (
          <Text className="text-xs text-muted-foreground">
            Este convite vale só para a conta do e-mail que o recebeu.
          </Text>
        ) : null}
        {error || decline.isError ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error ?? 'Não deu para recusar agora. Tente de novo.'}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
