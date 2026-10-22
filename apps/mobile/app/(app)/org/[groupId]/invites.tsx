import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import {
  batchResultMessage,
  batchSkipLabel,
  inviteSummary,
  orgApi,
  parseInviteEmails,
  parsedEmailsSummary,
  teamRoleLabel,
  type BatchInviteResult,
  type GrantableRole,
  type MyGroup,
} from '@fatia/api-client';
import { apiMessage, Choice, OrgPanel, orgKeys, PanelCard } from '@/components/org/org-panel';
import { Button, Input, LoadingState, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

const PAPEIS: GrantableRole[] = ['MEMBER', 'PROFESSIONAL', 'CREATOR'];

function Convites({ g }: { g: MyGroup }) {
  const qc = useQueryClient();
  const toast = useToast();
  const papeis = (g.role === 'OWNER' ? PAPEIS : (['MEMBER'] as GrantableRole[])).map((r) => ({
    value: r,
    label: teamRoleLabel(r),
  }));
  const refrescar = () => void qc.invalidateQueries({ queryKey: orgKeys.invites(g.id) });
  const falhou = (padrao: string) => (err: unknown) =>
    toast.show({ message: apiMessage(err, padrao) });

  const [papelLink, setPapelLink] = useState<GrantableRole>('MEMBER');
  const [usos, setUsos] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [papelEmail, setPapelEmail] = useState<GrantableRole>('MEMBER');
  const [email, setEmail] = useState('');
  const [lote, setLote] = useState('');
  const [resultado, setResultado] = useState<BatchInviteResult | null>(null);
  const lidos = parseInviteEmails(lote);

  const convites = useQuery({
    queryKey: orgKeys.invites(g.id),
    queryFn: () => orgApi.invites(g.id),
  });
  const criarLink = useMutation({
    mutationFn: () =>
      orgApi.createInvite(g.id, {
        role: papelLink,
        ...(usos ? { maxUses: Number(usos) } : {}),
        expiresInDays: 7,
      }),
    onSuccess: (r) => {
      setLink(r.url);
      refrescar();
    },
    onError: falhou('Não deu para criar o link agora.'),
  });
  const convidarEmail = useMutation({
    mutationFn: () => orgApi.createInvite(g.id, { role: papelEmail, email: email.trim() }),
    onSuccess: (r) => {
      toast.show({
        message: r.emailSent
          ? `Convite enviado para ${email.trim()}.`
          : 'Convite criado, mas o e-mail não saiu. Reenvie pela lista.',
      });
      setEmail('');
      refrescar();
    },
    onError: falhou('Não deu para convidar agora.'),
  });
  const convidarLote = useMutation({
    mutationFn: () => orgApi.createInviteBatch(g.id, { role: 'MEMBER', emails: lidos.valid }),
    onSuccess: (r) => {
      setResultado(r);
      setLote('');
      toast.show({ message: batchResultMessage(r.created.length, r.skipped.length) });
      refrescar();
    },
    onError: falhou('Não deu para enviar o lote agora.'),
  });
  const reenviar = useMutation({
    mutationFn: (id: string) => orgApi.resendInvite(g.id, id),
    onSuccess: () => {
      toast.show({ message: 'Convite reenviado. O link anterior deixou de valer.' });
      refrescar();
    },
    onError: falhou('Não deu para reenviar agora.'),
  });
  const revogar = useMutation({
    mutationFn: (id: string) => orgApi.revokeInvite(g.id, id),
    onSuccess: () => {
      toast.show({ message: 'Convite revogado.' });
      refrescar();
    },
    onError: falhou('Não deu para revogar agora.'),
  });

  return (
    <>
      <PanelCard title="Link de convite">
        {papeis.length > 1 ? (
          <Choice label="Entra como" options={papeis} value={papelLink} onChange={setPapelLink} />
        ) : null}
        <Input
          value={usos}
          onChangeText={(v) => setUsos(v.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          placeholder="Limite de usos (vazio = sem limite)"
          accessibilityLabel="Limite de usos"
        />
        <Text className="text-xs text-muted-foreground">Vale por 7 dias.</Text>
        <Button loading={criarLink.isPending} onPress={() => criarLink.mutate()}>
          Criar link
        </Button>
        {link ? (
          <View className="gap-2 rounded-xl bg-muted/50 p-3">
            <Text selectable className="text-xs text-foreground">
              {link}
            </Text>
            <View className="flex-row gap-2">
              <Button
                size="sm"
                onPress={() =>
                  void Share.share({ message: `Entre na ${g.name} no Fatia: ${link}` })
                }
              >
                Compartilhar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onPress={() =>
                  void Clipboard.setStringAsync(link).then(() =>
                    toast.show({ message: 'Link copiado.' }),
                  )
                }
              >
                Copiar
              </Button>
            </View>
            <Text className="text-xs text-muted-foreground">
              O link aparece só agora. Se perder, crie outro e revogue este na lista.
            </Text>
          </View>
        ) : null}
      </PanelCard>

      <PanelCard title="Convidar por e-mail">
        <Input
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="off"
          placeholder="E-mail"
          accessibilityLabel="E-mail"
        />
        {papeis.length > 1 ? (
          <Choice label="Entra como" options={papeis} value={papelEmail} onChange={setPapelEmail} />
        ) : null}
        <Button
          disabled={!email.includes('@')}
          loading={convidarEmail.isPending}
          onPress={() => convidarEmail.mutate()}
        >
          Enviar convite
        </Button>
      </PanelCard>

      <PanelCard title="Convidar em lote">
        <Input
          value={lote}
          onChangeText={(v) => {
            setLote(v);
            setResultado(null);
          }}
          multiline
          autoCapitalize="none"
          className="min-h-[100px]"
          textAlignVertical="top"
          placeholder="Cole os e-mails, um por linha"
          accessibilityLabel="E-mails para convidar"
        />
        {lote.trim() ? (
          <Text className="text-xs text-muted-foreground">{parsedEmailsSummary(lidos)}</Text>
        ) : null}
        <Button
          disabled={lidos.valid.length === 0}
          loading={convidarLote.isPending}
          onPress={() => convidarLote.mutate()}
        >
          {`Convidar ${lidos.valid.length} ${lidos.valid.length === 1 ? 'pessoa' : 'pessoas'}`}
        </Button>
        <Text className="text-xs text-muted-foreground">Em lote, todos entram como membro.</Text>
        {resultado && resultado.skipped.length > 0 ? (
          <View className="gap-0.5">
            <Text className="text-xs font-semibold text-foreground">Pulados</Text>
            {resultado.skipped.map((s) => (
              <Text key={`${s.email}-${s.reason}`} className="text-xs text-muted-foreground">
                {`${s.email}: ${batchSkipLabel(s.reason)}`}
              </Text>
            ))}
          </View>
        ) : null}
      </PanelCard>

      <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
        Convites que ainda valem
      </Text>
      {convites.isPending ? <LoadingState label="Carregando…" /> : null}
      {convites.data && convites.data.length === 0 ? (
        <Text className="text-xs text-muted-foreground">Nenhum convite aberto.</Text>
      ) : null}
      {convites.data && convites.data.length > 0 ? (
        <View className="overflow-hidden rounded-2xl border border-border bg-card">
          {convites.data.map((c, i) => (
            <View
              key={c.id}
              className={cn(
                'gap-2 px-4 py-3',
                i < convites.data.length - 1 && 'border-b border-border',
              )}
            >
              <Text className="text-sm text-foreground">{inviteSummary(c)}</Text>
              <Text className="text-xs text-muted-foreground">{teamRoleLabel(c.role)}</Text>
              <View className="flex-row gap-2">
                {c.email ? (
                  <Button size="sm" variant="outline" onPress={() => reenviar.mutate(c.id)}>
                    Reenviar
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onPress={() => revogar.mutate(c.id)}>
                  Revogar
                </Button>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

/** Equivalente de `apps/web/src/app/(org)/org/[groupId]/invites/page.tsx`. */
export default function OrgInvitesScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <OrgPanel groupId={groupId}>{(g) => <Convites g={g} />}</OrgPanel>;
}
