import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  challengePeriod,
  challengesApi,
  KIND_INFO,
  PHOTO_CONSENT_TEXT,
  type Challenge,
  type ChallengeDetail,
} from '@fatia/api-client';
import {
  CommunityNameField,
  useCommunityNameGate,
} from '@/components/community/community-name-field';
import { apiMessage } from '@/components/org/org-panel';
import {
  Button,
  Drawer,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerScrollView,
  DrawerTitle,
  Icon,
  Switch,
} from '@/components/ui';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { colors } from '@/theme/colors';
import { kindShort, privacyLine } from './challenge-view';

export const challengeKey = (groupId: string, id: string) =>
  ['community', 'challenges', groupId, id] as const;
export const challengeListKey = (groupId: string) => ['community', 'challenges', groupId] as const;

/**
 * Participar de um desafio (Cm-09): o que conta e, nos desafios com foto, o
 * aceite da foto de check-in (ADR 047). Sem o aceite o botão fica desligado: a
 * API recusa a entrada sem ele. O nome no ranking é o do perfil, sem pergunta.
 */
export function JoinChallengeDrawer({
  groupId,
  challenge,
  suggestedName,
  open,
  onOpenChange,
  onJoined,
}: {
  groupId: string;
  challenge: Challenge | null;
  /** O nome no ranking: o da comunidade, senão o do perfil (a API resolve). */
  suggestedName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoined?: (detail: ChallengeDetail) => void;
}) {
  if (!challenge) return null;
  // O formulário só monta com a folha aberta: cada abertura começa sem o aceite
  // marcado.
  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={['85%']}>
      <JoinForm
        groupId={groupId}
        challenge={challenge}
        suggestedName={suggestedName}
        onClose={() => onOpenChange(false)}
        onJoined={onJoined}
      />
    </Drawer>
  );
}

function JoinForm({
  groupId,
  challenge: c,
  suggestedName,
  onClose,
  onJoined,
}: {
  groupId: string;
  challenge: Challenge;
  suggestedName: string;
  onClose: () => void;
  onJoined?: (detail: ChallengeDetail) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [consent, setConsent] = useState(false);
  const nome = useCommunityNameGate();

  const join = useMutation({
    mutationFn: async () => {
      await nome.save();
      return challengesApi.join(groupId, c.id, undefined, {
        acceptPhotoTerms: c.needsPhotoConsent ? consent : undefined,
      });
    },
    onSuccess: (d) => {
      qc.setQueryData(challengeKey(groupId, d.id), d);
      void qc.invalidateQueries({ queryKey: challengeListKey(groupId), exact: true });
      onClose();
      toast.show({ message: `Você entrou como ${d.me?.displayName ?? suggestedName}.` });
      onJoined?.(d);
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para entrar agora.') }),
  });

  const needsConsent = c.needsPhotoConsent;
  const blocked = (needsConsent && !consent) || Boolean(nome.problem);
  const privacy = privacyLine(c);

  return (
    <>
      <DrawerHeader>
        <DrawerTitle>{`Participar de ${c.title}`}</DrawerTitle>
        <DrawerDescription>
          Os participantes veem seu nome e sua pontuação. Você pode sair enquanto o desafio não
          acabar.
        </DrawerDescription>
      </DrawerHeader>
      <DrawerScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 14 }}
      >
        {nome.needed ? (
          <CommunityNameField gate={nome} />
        ) : (
          <View className="flex-row items-center gap-3 rounded-card bg-card p-4">
            <Icon name="user" size={20} color={colors.mutedForeground} />
            <View className="flex-1 gap-0.5">
              <Text className="text-sm text-foreground">{`No ranking: ${suggestedName}`}</Text>
              <Text className="text-xs text-muted-foreground">
                É o nome do seu perfil. Para trocar, vá em Você → Editar perfil.
              </Text>
            </View>
          </View>
        )}

        <View className="flex-row items-start gap-3 rounded-card bg-card p-4">
          <Icon name={KIND_INFO[c.kind].icon} size={20} color={colors.primaryText} />
          <View className="flex-1 gap-1">
            <Text className="text-sm text-foreground">
              {`${KIND_INFO[c.kind].label}: ${kindShort(c)}, ${challengePeriod(c)}.`}
            </Text>
            <Text className="text-xs text-muted-foreground">{KIND_INFO[c.kind].explain}</Text>
            {privacy ? <Text className="text-xs text-muted-foreground">{privacy}</Text> : null}
          </View>
        </View>

        {needsConsent ? (
          <View className="gap-3 rounded-card border border-border p-4">
            <View className="flex-row items-start gap-3">
              <Icon name="lock" size={18} color={colors.mutedForeground} />
              <Text className="flex-1 text-sm text-foreground">{PHOTO_CONSENT_TEXT}</Text>
            </View>
            <View className="flex-row items-center justify-between gap-3">
              <Text className="flex-1 font-sans-semibold text-sm text-foreground">
                Entendi e aceito a foto de check-in
              </Text>
              <Switch
                checked={consent}
                onCheckedChange={setConsent}
                label="Aceito a foto de check-in"
              />
            </View>
          </View>
        ) : null}
      </DrawerScrollView>
      <DrawerFooter className="pb-8">
        <Button size="xl" disabled={blocked} loading={join.isPending} onPress={() => join.mutate()}>
          {nome.needed ? 'Participar' : `Participar como ${suggestedName}`}
        </Button>
        {needsConsent && !consent ? (
          <Text className="text-center text-xs text-muted-foreground">
            Para entrar, aceite a foto de check-in.
          </Text>
        ) : null}
      </DrawerFooter>
    </>
  );
}
