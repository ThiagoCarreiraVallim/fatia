import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown } from 'lucide-react-native';
import {
  alreadyInView,
  ApiError,
  CAMERA_NOTE,
  ENTRY_INVALID,
  entryPolicyView,
  groupsApi,
  joinResultMessage,
  autoLookCode,
  parseCommunityEntry,
  proOfferNote,
  VISIBILITY_WORD,
  type CommunityEntry,
  type JoinConsent,
  type ProOffer,
  type ShareScope,
  type TeamMember,
} from '@fatia/api-client';
import { DrawerInput } from '@/components/nutrition/drawer-input';
import { QrScanModal } from '@/components/onboarding/qr-scan';
import {
  Button,
  Drawer,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerScrollView,
  DrawerTitle,
} from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { colors } from '@/theme/colors';
import { ConsentForm } from './consent-form';
import { GroupAvatar } from './group-avatar';

/** A comunidade achada, venha de código ou de convite: o cartão do Cm-02. */
interface Found {
  entry: CommunityEntry;
  groupId: string;
  /** Patrocinada: o avatar leva a cor da comunidade, como no cartão da lista. */
  sponsored: boolean;
  name: string;
  meta: string;
  badge: string;
  tone: 'done' | 'lite' | 'pending';
  text: string;
  cta: string;
  proOffer: ProOffer;
  team: TeamMember[];
  required: ShareScope[];
}

const TONE = { ok: 'done', warn: 'lite', muted: 'pending' } as const;
const TYPE_WORD = { SPONSORED: 'patrocinada', SOCIAL: 'social' } as const;
const membros = (n: number) => `${n} ${n === 1 ? 'membro' : 'membros'}`;

async function lookup(entry: CommunityEntry): Promise<Found> {
  if (entry.kind === 'invite') {
    const c = await groupsApi.previewInvite(entry.token);
    return {
      entry,
      groupId: c.group.id,
      sponsored: c.group.type === 'SPONSORED',
      name: c.group.name,
      meta: `${TYPE_WORD[c.group.type]} · ${membros(c.memberCount)}`,
      badge: 'convite',
      tone: 'done',
      text: c.invitedBy ? `Convite de ${c.invitedBy}: entra na hora` : 'O convite já é a aprovação',
      cta: 'Entrar',
      proOffer: null,
      team: c.team,
      required: c.requiredSharingScopes,
    };
  }
  const g = await groupsApi.previewByCode(entry.code);
  const policy = entryPolicyView(g.joinPolicy);
  return {
    entry: { kind: 'code', code: g.code },
    groupId: g.id,
    sponsored: g.type === 'SPONSORED',
    name: g.name,
    meta: `${TYPE_WORD[g.type]} · ${VISIBILITY_WORD[g.visibility]} · ${membros(g.memberCount)}`,
    badge: policy.badge,
    tone: TONE[policy.tone],
    text: policy.text,
    cta: policy.cta,
    proOffer: g.proOffer,
    team: g.team,
    required: g.requiredSharingScopes,
  };
}

/**
 * Entrar numa comunidade (Cm-02), espelho de
 * `apps/web/src/components/community/join-by-code-drawer.tsx`, mais a leitura
 * do QR da recepção pela câmera (`expo-camera`, roda no Expo Go). Código
 * inválido, vencido, revogado ou de comunidade só por convite dá a mesma frase.
 */
export function JoinByCodeDrawer({
  open,
  onOpenChange,
  onJoined,
  initialCode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoined: (groupId: string) => void;
  /** O código que veio no link do QR (`/community?join=1&code=…`): já procura. */
  initialCode?: string | null;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState(initialCode ?? '');
  const [found, setFound] = useState<Found | null>(null);
  const [sharing, setSharing] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [scanning, setScanning] = useState(false);
  // A lista da tela de trás (já em cache): quem já está na comunidade não refaz o pedido.
  const mine = useQuery({ queryKey: ['community', 'mine'], queryFn: () => groupsApi.mine() });

  const look = useMutation({
    mutationFn: lookup,
    onSuccess: (f) => {
      setFound(f);
      setInvalid(false);
    },
    onError: (err) => setInvalid(err instanceof ApiError && err.isNotFound),
  });
  const join = useMutation({
    mutationFn: (consent: JoinConsent) =>
      found!.entry.kind === 'invite'
        ? groupsApi.acceptInvite(found!.entry.token, consent)
        : groupsApi.join(found!.entry.code, consent),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      void qc.invalidateQueries({ queryKey: ['billing'] });
      toast.show({ message: joinResultMessage(r) });
      reset(false);
      onJoined(r.groupId);
    },
  });

  function reset(aberto: boolean) {
    if (!aberto) {
      setCode('');
      setLookedFor(null);
      setFound(null);
      setSharing(false);
      setInvalid(false);
      look.reset();
      join.reset();
    }
    onOpenChange(aberto);
  }

  function search(raw: string) {
    const entry = parseCommunityEntry(raw);
    setFound(null);
    if (!entry) {
      setInvalid(true);
      return;
    }
    look.mutate(entry);
  }

  // O link do QR abre a folha já com o código: procura uma vez por código. A aba
  // fica montada, então um link novo traz outro `initialCode` sem remontar.
  const [lookedFor, setLookedFor] = useState<string | null>(null);
  const alvo = autoLookCode({ open, initialCode, lookedFor });
  if (alvo) {
    setLookedFor(alvo);
    setCode(alvo);
    setFound(null);
    setInvalid(parseCommunityEntry(alvo) === null);
  }
  const lookMutate = look.mutate;
  useEffect(() => {
    const entry = lookedFor ? parseCommunityEntry(lookedFor) : null;
    if (entry) lookMutate(entry);
  }, [lookedFor, lookMutate]);

  const lookError = invalid
    ? ENTRY_INVALID
    : look.isError
      ? 'Não deu para procurar agora. Tente de novo.'
      : null;
  const joinError = join.isError
    ? join.error instanceof ApiError && join.error.isConflict
      ? join.error.message
      : 'Não deu para entrar agora. Tente de novo.'
    : null;

  const already = found ? alreadyInView(mine.data, found.groupId) : null;
  const card = found
    ? already
      ? { badge: already.badge, tone: TONE[already.tone], text: already.text }
      : { badge: found.badge, tone: found.tone, text: found.text }
    : null;

  return (
    <>
      <Drawer open={open} onOpenChange={reset} snapPoints={['85%']}>
        <DrawerHeader>
          <DrawerTitle>
            {sharing && found ? `O que compartilhar com ${found.name}` : 'Entrar numa comunidade'}
          </DrawerTitle>
          <DrawerDescription>
            {sharing
              ? 'A equipe vê só o que você ligar aqui. Dá para mudar depois, em Sobre.'
              : 'Leia o QR Code da recepção ou digite o código ou o link que sua academia ou treinador divulgou.'}
          </DrawerDescription>
        </DrawerHeader>
        {sharing && found ? (
          <DrawerScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}>
            <ConsentForm
              team={found.team}
              required={found.required}
              submitLabel={found.cta}
              pending={join.isPending}
              error={joinError}
              onSubmit={(consent) => join.mutate(consent)}
              secondary={
                <Button variant="ghost" onPress={() => setSharing(false)}>
                  Voltar
                </Button>
              }
            />
          </DrawerScrollView>
        ) : (
          <>
            <DrawerScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}
            >
              <Button variant="outline" onPress={() => setScanning(true)}>
                Ler QR Code
              </Button>
              <Text className="text-xs text-muted-foreground">{CAMERA_NOTE}</Text>
              <DrawerInput
                label="Código ou link"
                placeholder="AD7K3Q9P"
                autoCapitalize="characters"
                autoCorrect={false}
                value={code}
                onChangeText={(t) => {
                  setCode(t);
                  setInvalid(false);
                }}
                onSubmitEditing={() => search(code)}
              />
              {lookError ? (
                <Text accessibilityRole="alert" className="text-sm text-danger">
                  {lookError}
                </Text>
              ) : null}
              {found ? (
                <View
                  accessibilityLabel="Comunidade encontrada"
                  className="gap-3 rounded-2xl bg-card p-4"
                >
                  <View className="flex-row items-center gap-3">
                    <GroupAvatar name={found.name} url={null} brand={found.sponsored} />
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="font-sans-bold text-foreground">
                        {found.name}
                      </Text>
                      <Text className="text-xs text-muted-foreground">{found.meta}</Text>
                    </View>
                  </View>
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Badge variant={card!.tone}>{card!.badge}</Badge>
                    <Text className="text-xs text-muted-foreground">{card!.text}</Text>
                  </View>
                  {!already && proOfferNote(found.proOffer) ? (
                    <View className="flex-row items-center gap-2 rounded-xl bg-primary/10 px-3 py-2">
                      <Crown size={16} color={colors.primaryText} />
                      <Text className="flex-1 text-sm text-foreground">
                        {proOfferNote(found.proOffer)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </DrawerScrollView>
            <DrawerFooter className="pb-8">
              {found && already ? (
                <Button
                  onPress={() => {
                    const id = found.groupId;
                    reset(false);
                    onJoined(id);
                  }}
                >
                  {already.cta}
                </Button>
              ) : found ? (
                <Button onPress={() => setSharing(true)}>{found.cta}</Button>
              ) : (
                <Button
                  disabled={!code.trim()}
                  loading={look.isPending}
                  onPress={() => search(code)}
                >
                  Continuar
                </Button>
              )}
            </DrawerFooter>
          </>
        )}
      </Drawer>
      <QrScanModal
        open={scanning}
        title="Ler QR Code"
        parse={(raw) => (parseCommunityEntry(raw) ? raw : null)}
        onClose={() => setScanning(false)}
        onCode={(raw) => {
          setScanning(false);
          const entry = parseCommunityEntry(raw);
          setCode(entry?.kind === 'code' ? entry.code : raw);
          search(raw);
        }}
      />
    </>
  );
}
