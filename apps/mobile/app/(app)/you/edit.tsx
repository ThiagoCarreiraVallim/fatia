import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  AVATAR_VISIBILITY_OPTIONS,
  avatarUploadNotice,
  avatarVisibilityText,
  communityName,
  formatWhatsapp,
  uploadAvatar,
  usersApi,
  whatsappOptInText,
  type AvatarVisibility,
  type MeUser,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { describePickedImage } from '@/components/content/picked-image';
import { Button, Input, LoadingState, Segmented, useToast } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui/utils';
import { UserAvatar } from '@/components/you/user-avatar';
import { ToggleTrack } from '@/components/you/you-list';
import { colors } from '@/theme/colors';

const BIO_MAX = 140;
const fieldClass = 'h-[52px] rounded-field border-0 bg-card px-[18px] text-base';

interface Form {
  name: string;
  nickname: string;
  bio: string;
  visibility: AvatarVisibility;
  whatsapp: string;
  optIn: boolean;
}

const formOf = (me: MeUser): Form => ({
  name: me.name,
  nickname: me.nickname ?? '',
  bio: me.bio ?? '',
  visibility: me.avatarVisibility,
  whatsapp: formatWhatsapp(me.whatsapp),
  optIn: me.whatsappOptIn,
});

/**
 * Editar perfil (prancha Al-V9) — réplica de
 * `apps/web/src/components/you/edit-profile-screen.tsx`. O corte quadrado é
 * o do próprio seletor (`allowsEditing`, 1:1), que funciona no Expo Go; o
 * `exif: false` e a API tiram localização e dados da câmera.
 */
export default function EditProfileScreen() {
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  // O formulário monta a própria `Screen`: o Salvar fica no topo (prancha Al-V9).
  return me.data ? (
    <EditForm me={me.data} />
  ) : (
    <Screen>
      <LoadingState />
    </Screen>
  );
}

function EditForm({ me }: { me: MeUser }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<Form>(() => formOf(me));
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const photo = useMutation({
    mutationFn: async (from: 'camera' | 'gallery') => {
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        exif: false,
      };
      if (from === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) throw new Error('Sem acesso à câmera. Libere nos ajustes do celular.');
      }
      const r =
        from === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      const asset = r.canceled ? null : r.assets?.[0];
      if (!asset) return null;
      const body = await (await fetch(asset.uri)).blob();
      const info = describePickedImage(asset, body.size);
      if ('problem' in info) throw new Error(info.problem);
      return uploadAvatar(info, (url, headers) => fetch(url, { method: 'PUT', body, headers }));
    },
    onSuccess: (data, from) => {
      if (!data) return;
      qc.setQueryData(['users', 'me'], data);
      toast.show({ message: from === 'camera' ? 'Foto tirada' : 'Foto escolhida' });
    },
    onError: (err) =>
      toast.show({
        message:
          err instanceof ApiError
            ? err.status === 503
              ? 'O envio de fotos não está disponível agora.'
              : 'Não deu para enviar a foto. Tente de novo.'
            : err instanceof Error
              ? err.message
              : 'Não deu para enviar a foto. Tente de novo.',
      }),
  });

  const removePhoto = useMutation({
    mutationFn: () => usersApi.removeAvatar(),
    onSuccess: (data) => qc.setQueryData(['users', 'me'], data),
    onError: () => toast.show({ message: 'Não deu para remover a foto. Tente de novo.' }),
  });

  const save = useMutation({
    mutationFn: () =>
      usersApi.updateMe({
        name: form.name.trim(),
        nickname: form.nickname.trim() || null,
        bio: form.bio.trim() || null,
        avatarVisibility: form.visibility,
        whatsapp: form.whatsapp.trim() || null,
        whatsappOptIn: form.whatsapp.trim() ? form.optIn : false,
      }),
    onSuccess: (data) => {
      qc.setQueryData(['users', 'me'], data);
      toast.show({ message: 'Perfil salvo' });
      router.back();
    },
    onError: (err) =>
      toast.show({
        message: err instanceof ApiError ? err.message : 'Não deu para salvar. Tente de novo.',
      }),
  });

  const busy = photo.isPending || removePhoto.isPending;
  const uploadNotice = avatarUploadNotice(me);
  const hasWhatsapp = !!form.whatsapp.trim();
  const shownName = form.name || me.name;

  return (
    <Screen
      actions={
        <Button
          size="xs"
          className="h-11 px-4"
          loading={save.isPending}
          disabled={!form.name.trim()}
          onPress={() => save.mutate()}
        >
          Salvar
        </Button>
      }
    >
      <View className="gap-[18px] px-6 pb-8 pt-2">
        <View className="items-center gap-3">
          <UserAvatar name={shownName} url={me.avatarUrl} size={112} />
          <View className="flex-row flex-wrap justify-center gap-2">
            {uploadNotice ? null : (
              <>
                <PhotoButton icon="camera" disabled={busy} onPress={() => photo.mutate('camera')}>
                  Tirar foto
                </PhotoButton>
                <PhotoButton icon="image" disabled={busy} onPress={() => photo.mutate('gallery')}>
                  Galeria
                </PhotoButton>
              </>
            )}
            {me.avatarUrl ? (
              <PhotoButton danger disabled={busy} onPress={() => removePhoto.mutate()}>
                Remover
              </PhotoButton>
            ) : null}
          </View>
          <Text className="text-center text-xs text-faint">
            {uploadNotice ??
              (photo.isPending
                ? 'Enviando a foto…'
                : 'A foto é cortada em círculo. Localização e dados da câmera são apagados.')}
          </Text>
        </View>

        <Field label="Nome">
          <Input
            accessibilityLabel="Nome"
            className={fieldClass}
            value={form.name}
            maxLength={120}
            onChangeText={(v) => set('name', v)}
          />
        </Field>

        <Field
          label="Como aparece nas comunidades"
          hint="Vale para mural, comentários e ranking dos desafios."
        >
          <Input
            accessibilityLabel="Como aparece nas comunidades"
            className={fieldClass}
            value={form.nickname}
            maxLength={60}
            placeholder={communityName({ name: shownName, nickname: null })}
            onChangeText={(v) => set('nickname', v)}
          />
        </Field>

        <Field label="Sobre você (opcional)" hint={`${form.bio.length}/${BIO_MAX}`}>
          <Input
            accessibilityLabel="Sobre você"
            className="h-[88px] rounded-field border-0 bg-card px-3.5 py-3 text-base"
            multiline
            textAlignVertical="top"
            maxLength={BIO_MAX}
            placeholder="Ex.: treino de manhã, correndo minha primeira 10 km"
            value={form.bio}
            onChangeText={(v) => set('bio', v.slice(0, BIO_MAX))}
          />
        </Field>

        <View className="gap-2">
          <Eyebrow>Quem vê sua foto</Eyebrow>
          <Segmented
            label="Quem vê sua foto"
            options={AVATAR_VISIBILITY_OPTIONS}
            value={form.visibility}
            onChange={(v) => set('visibility', v)}
          />
          <Text className="text-[13px] text-muted-foreground">
            {avatarVisibilityText(form.visibility)}
          </Text>
        </View>

        <View className="gap-2">
          <Eyebrow>Prévia na comunidade</Eyebrow>
          <View className="gap-2.5 rounded-card bg-card p-4">
            <View className="flex-row items-center gap-2">
              <UserAvatar name={shownName} url={me.avatarUrl} size={28} />
              <Text className="font-sans-bold text-sm text-foreground">
                {communityName({ name: shownName, nickname: form.nickname })}
              </Text>
              <Text className="text-[13px] text-muted-foreground">agora</Text>
            </View>
            <Text className="text-sm text-foreground">Fechei mais uma semana de treino!</Text>
          </View>
        </View>

        <Field
          label="E-mail"
          hint={
            me.emailChangeEnabled
              ? 'Pedimos sua senha e um código no e-mail novo.'
              : 'A troca de e-mail ainda não está disponível neste servidor.'
          }
        >
          <View className="h-[52px] flex-row items-center justify-between rounded-field bg-card px-[18px]">
            <Text className="flex-1 text-[15px] text-muted-foreground" numberOfLines={1}>
              {me.email}
            </Text>
            {me.emailChangeEnabled ? (
              <Text
                accessibilityRole="button"
                onPress={() => router.push('/you/email')}
                className="font-sans-bold text-sm text-primary"
              >
                Trocar
              </Text>
            ) : null}
          </View>
        </Field>

        <Field label="WhatsApp">
          <Input
            accessibilityLabel="WhatsApp"
            className={fieldClass}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            placeholder="(65) 99999-9999"
            value={form.whatsapp}
            onChangeText={(v) => set('whatsapp', v)}
          />
        </Field>

        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Equipe pode me chamar no WhatsApp"
          accessibilityState={{ checked: form.optIn && hasWhatsapp, disabled: !hasWhatsapp }}
          disabled={!hasWhatsapp}
          onPress={() => set('optIn', !form.optIn)}
          className={
            hasWhatsapp
              ? 'flex-row items-center gap-3 rounded-card bg-card p-4'
              : 'flex-row items-center gap-3 rounded-card bg-card p-4 opacity-60'
          }
        >
          <Icon name="whats" size={20} color={colors.mutedForeground} />
          <View className="flex-1">
            <Text className="font-sans-bold text-[15px] text-foreground">
              Equipe pode me chamar no WhatsApp
            </Text>
            <Text className="text-[13px] text-muted-foreground">
              {whatsappOptInText(form.optIn && hasWhatsapp)}
            </Text>
          </View>
          <ToggleTrack on={form.optIn && hasWhatsapp} />
        </Pressable>

        <Text className="text-xs text-faint">
          O Fatia não tem chat entre pessoas. Conversas com a equipe ficam no WhatsApp.
        </Text>
      </View>
    </Screen>
  );
}

/** Botão da foto (`btn sm` da prancha): 44 de altura, cantos 12, fundo `--s2`. */
function PhotoButton({
  icon,
  danger,
  disabled,
  onPress,
  children,
}: {
  icon?: 'camera' | 'image';
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'h-11 flex-row items-center gap-2 rounded-[12px] bg-muted px-[18px] active:opacity-70',
        disabled && 'opacity-50',
      )}
    >
      {icon ? <Icon name={icon} size={16} color={colors.foreground} /> : null}
      <Text className={cn('font-sans-bold text-sm', danger ? 'text-danger' : 'text-foreground')}>
        {children}
      </Text>
    </Pressable>
  );
}

function Eyebrow({ children }: { children: string }) {
  return (
    <Text className="font-sans-bold text-xs uppercase tracking-[0.72px] text-faint">
      {children}
    </Text>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      <Text className="font-sans-semibold text-[13px] text-muted-foreground">{label}</Text>
      {children}
      {hint ? <Text className="text-xs text-faint">{hint}</Text> : null}
    </View>
  );
}
