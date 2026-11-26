import { useState } from 'react';
import { Linking, Share, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import {
  emailsFromPaste,
  groupsApi,
  INVITE_SMALL_SAMPLE,
  inviteModeStat,
  inviteModeTitle,
  invitePosterUrl,
  orgApi,
  panelHref,
  reportApi,
  type InviteMode,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { InviteQr } from '@/components/org/invite-qr';
import { apiMessage, orgKeys } from '@/components/org/org-panel';
import { useSetup } from '@/components/org/setup-guide';
import { Button, Icon, Input, LoadingState, Segmented } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { brandColors } from '@/components/ui/ds-math';
import { colors } from '@/theme/colors';

/**
 * Convidar alunos (#372, prancha Onb-C4): link da bio, QR com nome (o nome é
 * só da equipe, vira a origem em #400) e cartaz A4, ou lista de e-mails. A
 * contagem "entraram / ativaram" é a das Origens, com a regra dos 5.
 */
export default function InviteMembersScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<InviteMode>('qr');
  const [qrName, setQrName] = useState('recepção');
  const [links, setLinks] = useState<Partial<Record<InviteMode, string>>>({});
  const [paste, setPaste] = useState('');
  const emails = emailsFromPaste(paste);

  const group = useQuery({
    queryKey: orgKeys.group(groupId),
    queryFn: () => groupsApi.get(groupId),
  });
  const setup = useSetup(group.data ?? { id: groupId, role: 'MEMBER', isDemo: true });
  const origins = useQuery({
    queryKey: [...orgKeys.all(groupId), 'invites', 'origins', 30],
    queryFn: () => reportApi.origins(groupId, 30),
    enabled: group.data?.role === 'OWNER',
  });
  const done = () => {
    void qc.invalidateQueries({ queryKey: orgKeys.all(groupId) });
  };
  const falhou = (err: unknown) =>
    toast.show({ message: apiMessage(err, 'Não deu para criar o convite agora.') });

  const createLink = useMutation({
    mutationFn: (m: 'link' | 'qr') =>
      orgApi.createInvite(
        groupId,
        m === 'qr'
          ? { role: 'MEMBER', label: qrName.trim() || 'QR', origin: 'QR', noExpiry: true }
          : { role: 'MEMBER', label: 'Link da bio', origin: 'INSTAGRAM', noExpiry: true },
      ),
    onSuccess: (r, m) => {
      setLinks((l) => ({ ...l, [m]: r.url }));
      done();
    },
    onError: falhou,
  });
  const sendList = useMutation({
    mutationFn: () => orgApi.createInviteBatch(groupId, { emails, role: 'MEMBER' }),
    onSuccess: (r) => {
      toast.show({ message: `${r.created.length} convites enviados` });
      setPaste('');
      done();
    },
    onError: falhou,
  });

  if (group.isPending) {
    return (
      <Screen title="Convidar alunos">
        <LoadingState label="Carregando…" />
      </Screen>
    );
  }
  const g = group.data;
  const marca = brandColors(g?.brandColor);
  const stat = inviteModeStat(origins.data, mode, qrName);
  const url = mode === 'list' ? null : (links[mode] ?? null);
  const poster = url ? invitePosterUrl(url) : null;

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    toast.show({ message: 'Link copiado' });
  };

  return (
    <Screen
      title="Convidar alunos"
      footer={
        <Button
          variant="secondary"
          size="xl"
          onPress={() => router.replace(panelHref(groupId) as never)}
        >
          Voltar ao checklist
        </Button>
      }
    >
      <View className="gap-5 px-5 pb-4 pt-2">
        <Segmented<InviteMode>
          label="Como convidar"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'link', label: 'Link' },
            { value: 'qr', label: 'QR' },
            { value: 'list', label: 'Lista' },
          ]}
        />

        {mode === 'qr' ? (
          <View className="gap-1.5">
            <Text className="text-[13px] font-semibold text-muted-foreground">Nome deste QR</Text>
            <Input
              value={qrName}
              onChangeText={(v) => {
                setQrName(v);
                setLinks((l) => ({ ...l, qr: undefined }));
              }}
              maxLength={60}
              accessibilityLabel="Nome deste QR"
            />
            <Text className="text-[13px] text-muted-foreground">
              Só a equipe vê. Ajuda a saber de onde vem cada pessoa.
            </Text>
          </View>
        ) : null}

        {mode === 'link' ? (
          <View className="gap-2 rounded-card bg-card p-4">
            <Text className="text-sm text-muted-foreground">
              Mande no grupo da academia ou na bio
            </Text>
            {url ? (
              <Text selectable className="font-mono text-xs text-foreground">
                {url}
              </Text>
            ) : null}
            <Button
              loading={createLink.isPending}
              onPress={() => (url ? void copy(url) : createLink.mutate('link'))}
            >
              {url ? 'Copiar link' : 'Criar link'}
            </Button>
            <Text className="text-[13px] text-muted-foreground">
              Quem entra pelo link passa pela aprovação, se ela estiver ligada.
            </Text>
          </View>
        ) : null}

        {mode === 'qr' ? (
          <View
            className="items-center gap-4 rounded-card p-5"
            style={{ backgroundColor: marca.background }}
          >
            <Text className="text-center font-display text-lg" style={{ color: marca.foreground }}>
              {`${g?.name ?? ''} no Fatia`}
            </Text>
            {url ? (
              <View className="rounded-3xl bg-white p-3">
                <InviteQr url={url} />
              </View>
            ) : (
              <Button
                variant="secondary"
                loading={createLink.isPending}
                onPress={() => createLink.mutate('qr')}
              >
                Gerar QR
              </Button>
            )}
            <Text className="font-bold" style={{ color: marca.foreground }}>
              Aponte a câmera para entrar
            </Text>
          </View>
        ) : null}
        {mode === 'qr' && url ? (
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button
                variant="secondary"
                disabled={!poster}
                onPress={() => poster && void Linking.openURL(poster)}
              >
                Cartaz A4
              </Button>
            </View>
            <View className="flex-1">
              <Button variant="secondary" onPress={() => void Share.share({ message: url })}>
                Enviar
              </Button>
            </View>
          </View>
        ) : null}

        {mode === 'list' ? (
          <View className="gap-2">
            <Text className="text-[13px] font-semibold text-muted-foreground">
              E-mails, um por linha (ou cole a coluna da planilha)
            </Text>
            <Input
              value={paste}
              onChangeText={setPaste}
              multiline
              autoCapitalize="none"
              keyboardType="email-address"
              className="min-h-[120px]"
              textAlignVertical="top"
              accessibilityLabel="E-mails"
            />
            <Text className="text-[13px] text-muted-foreground">
              {emails.length ? `${emails.length} e-mails válidos` : 'Nenhum e-mail ainda'}
            </Text>
            <Button
              disabled={emails.length === 0}
              loading={sendList.isPending}
              onPress={() => sendList.mutate()}
            >
              {emails.length ? `Enviar ${emails.length} convites` : 'Enviar convites'}
            </Button>
          </View>
        ) : null}

        {g?.role === 'OWNER' ? (
          <View className="gap-2 rounded-card bg-card p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-muted-foreground">{inviteModeTitle(mode, qrName)}</Text>
              {setup.data ? (
                <Button
                  variant="text"
                  size="xs"
                  onPress={() => void Linking.openURL(`${setup.data!.webUrl}/origins`)}
                >
                  Ver origens
                </Button>
              ) : null}
            </View>
            {stat ? (
              <View className="flex-row items-end gap-6">
                <View>
                  <Text className="font-display text-3xl text-foreground">{stat.joined}</Text>
                  <Text className="text-[13px] text-muted-foreground">entraram</Text>
                </View>
                <View>
                  <Text className="font-display text-3xl text-primary-text">
                    {stat.activated ?? '—'}
                  </Text>
                  <Text className="text-[13px] text-muted-foreground">ativaram</Text>
                </View>
                <Text className="flex-1 text-right text-[13px] text-muted-foreground">
                  ativou = registrou algo
                </Text>
              </View>
            ) : (
              <View className="flex-row items-center gap-2">
                <Icon name="info" size={16} color={colors.mutedForeground} />
                <Text className="flex-1 text-[13px] text-muted-foreground">
                  {INVITE_SMALL_SAMPLE}
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
