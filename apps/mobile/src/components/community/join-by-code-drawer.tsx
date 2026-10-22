import { useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  groupsApi,
  joinPolicyLabel,
  joinResultMessage,
  type GroupPreview,
  type JoinConsent,
} from '@fatia/api-client';
import { DrawerInput } from '@/components/nutrition/drawer-input';
import {
  Button,
  Drawer,
  DrawerDescription,
  DrawerHeader,
  DrawerScrollView,
  DrawerTitle,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { ConsentForm } from './consent-form';

/** Réplica de `apps/web/src/components/community/join-by-code-drawer.tsx`. */
export function JoinByCodeDrawer({
  open,
  onOpenChange,
  onJoined,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoined: (groupId: string) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<GroupPreview | null>(null);

  const look = useMutation({
    mutationFn: (slug: string) => groupsApi.previewBySlug(slug),
    onSuccess: setPreview,
  });
  const join = useMutation({
    mutationFn: (consent: JoinConsent) => groupsApi.join(preview!.slug, consent),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      toast.show({ message: joinResultMessage(r) });
      fechar(false);
      onJoined(r.groupId);
    },
  });

  function fechar(aberto: boolean) {
    if (!aberto) {
      setCode('');
      setPreview(null);
      look.reset();
      join.reset();
    }
    onOpenChange(aberto);
  }

  const erroDaBusca = look.isError
    ? look.error instanceof ApiError && look.error.isNotFound
      ? 'Nenhuma comunidade com esse código.'
      : 'Não deu para procurar agora. Tente de novo.'
    : null;
  const erroDaEntrada = join.isError
    ? join.error instanceof ApiError && join.error.isConflict
      ? join.error.message
      : 'Não deu para entrar agora. Tente de novo.'
    : null;

  return (
    <Drawer open={open} onOpenChange={fechar} snapPoints={preview ? ['90%'] : undefined}>
      <DrawerHeader>
        <DrawerTitle>{preview ? preview.name : 'Entrar com código'}</DrawerTitle>
        <DrawerDescription>
          {preview
            ? `${joinPolicyLabel(preview.joinPolicy)} · ${preview.memberCount} ${preview.memberCount === 1 ? 'membro' : 'membros'}`
            : 'O código que sua academia ou seu treinador divulgou.'}
        </DrawerDescription>
      </DrawerHeader>
      {preview ? (
        <DrawerScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {preview.description ? (
            <Text className="text-sm text-muted-foreground">{preview.description}</Text>
          ) : null}
          <ConsentForm
            team={preview.team}
            required={preview.requiredSharingScopes}
            submitLabel={preview.joinPolicy === 'OPEN' ? 'Entrar' : 'Pedir para entrar'}
            pending={join.isPending}
            error={erroDaEntrada}
            onSubmit={(consent) => join.mutate(consent)}
            secondary={
              <Button variant="ghost" onPress={() => setPreview(null)}>
                Outro código
              </Button>
            }
          />
        </DrawerScrollView>
      ) : (
        <View className="gap-3 px-4 pb-6">
          <DrawerInput
            label="Código da comunidade"
            placeholder="ex.: academia-centro"
            autoCapitalize="none"
            autoCorrect={false}
            value={code}
            onChangeText={setCode}
          />
          {erroDaBusca ? (
            <Text accessibilityRole="alert" className="text-sm text-destructive">
              {erroDaBusca}
            </Text>
          ) : null}
          <Button
            disabled={!code.trim()}
            loading={look.isPending}
            onPress={() => look.mutate(code.trim().toLowerCase())}
          >
            Continuar
          </Button>
        </View>
      )}
    </Drawer>
  );
}
