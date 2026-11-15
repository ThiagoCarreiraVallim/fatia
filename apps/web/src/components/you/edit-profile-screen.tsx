'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ApiError,
  AVATAR_VISIBILITY_OPTIONS,
  avatarVisibilityText,
  communityName,
  formatWhatsapp,
  imageProblem,
  uploadAvatar,
  usersApi,
  whatsappOptInText,
  type AvatarVisibility,
  type MeUser,
} from '@fatia/api-client';
import { TopBarActions } from '@/components/layout/app-top-bar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { cropAvatar } from './avatar-crop';
import { UserAvatar } from './user-avatar';
import { ToggleTrack } from './you-list';

export const BIO_MAX = 140;

const fieldClass =
  'w-full rounded-field bg-card px-[18px] text-base text-foreground placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const labelClass = 'text-[13px] font-semibold text-muted-foreground';
const hintClass = 'text-xs text-faint';
const eyebrowClass = 'text-xs font-bold uppercase tracking-[0.06em] text-faint';

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
 * Editar perfil (prancha Al-V9): foto, nome, apelido das comunidades, bio,
 * quem vê a foto, e-mail só de leitura e o WhatsApp para a equipe.
 *
 * A foto vale na hora (envia, corta e troca); o resto vai junto no Salvar.
 */
export function EditProfileScreen() {
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  if (!me.data) return <Skeleton className="mx-6 mt-4 h-[480px] rounded-card" />;
  return <EditProfileForm me={me.data} />;
}

function EditProfileForm({ me }: { me: MeUser }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(() => formOf(me));
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const photo = useMutation({
    mutationFn: async ({ file }: { file: File; from: 'camera' | 'gallery' }) => {
      const problem = imageProblem(file);
      if (problem) throw new Error(problem);
      const square = await cropAvatar(file).catch(() => file);
      return uploadAvatar({ mime: square.type || file.type, bytes: square.size }, (url, headers) =>
        fetch(url, { method: 'PUT', body: square, headers }),
      );
    },
    onSuccess: (data, { from }) => {
      qc.setQueryData(['users', 'me'], data);
      toast(from === 'camera' ? 'Foto tirada' : 'Foto escolhida');
    },
    onError: (err) =>
      toast(
        err instanceof ApiError && err.status === 503
          ? 'O envio de fotos não está disponível agora.'
          : err instanceof Error && !(err instanceof ApiError)
            ? err.message
            : 'Não deu para enviar a foto. Tente de novo.',
      ),
  });

  const removePhoto = useMutation({
    mutationFn: () => usersApi.removeAvatar(),
    onSuccess: (data) => qc.setQueryData(['users', 'me'], data),
    onError: () => toast('Não deu para remover a foto. Tente de novo.'),
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
      toast('Perfil salvo');
      router.push('/you');
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : 'Não deu para salvar. Tente de novo.'),
  });

  const pick = (from: 'camera' | 'gallery') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) photo.mutate({ file, from });
  };

  const busy = photo.isPending || removePhoto.isPending;
  const preview = communityName({ name: form.name || me.name, nickname: form.nickname });

  return (
    <form
      id="perfil-form"
      className="flex flex-col gap-[18px] px-6 pb-8 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {/* Salvar fica no topo, à direita do título (prancha Al-V9). */}
      <TopBarActions>
        <Button
          type="submit"
          form="perfil-form"
          size="lg"
          className="px-4"
          disabled={save.isPending || !form.name.trim()}
        >
          {save.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </TopBarActions>

      <div className="flex flex-col items-center gap-3">
        <UserAvatar name={form.name || me.name} url={me.avatarUrl} size={112} />
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="bg-muted"
            disabled={busy}
            onClick={() => camera.current?.click()}
          >
            <Icon name="camera" size={16} />
            Tirar foto
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="bg-muted"
            disabled={busy}
            onClick={() => gallery.current?.click()}
          >
            <Icon name="image" size={16} />
            Galeria
          </Button>
          {me.avatarUrl && (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="bg-muted text-danger"
              disabled={busy}
              onClick={() => removePhoto.mutate()}
            >
              Remover
            </Button>
          )}
        </div>
        <p className={`${hintClass} text-center`}>
          {photo.isPending
            ? 'Enviando a foto…'
            : 'A foto é cortada em círculo. Localização e dados da câmera são apagados.'}
        </p>
        <input
          ref={camera}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={pick('camera')}
        />
        <input
          ref={gallery}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={pick('gallery')}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="perfil-nome" className={labelClass}>
          Nome
        </label>
        <input
          id="perfil-nome"
          className={`${fieldClass} h-[52px]`}
          value={form.name}
          maxLength={120}
          required
          onChange={(e) => set('name', e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="perfil-apelido" className={labelClass}>
          Como aparece nas comunidades
        </label>
        <input
          id="perfil-apelido"
          className={`${fieldClass} h-[52px]`}
          value={form.nickname}
          maxLength={60}
          placeholder={communityName({ name: form.name || me.name, nickname: null })}
          onChange={(e) => set('nickname', e.target.value)}
        />
        <span className={hintClass}>Vale para mural, comentários e ranking dos desafios.</span>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="perfil-bio" className={labelClass}>
          Sobre você (opcional)
        </label>
        <textarea
          id="perfil-bio"
          className={`${fieldClass} h-[88px] resize-none px-3.5 py-3`}
          maxLength={BIO_MAX}
          placeholder="Ex.: treino de manhã, correndo minha primeira 10 km"
          value={form.bio}
          onChange={(e) => set('bio', e.target.value.slice(0, BIO_MAX))}
        />
        <span className={`${hintClass} tabular-nums`} aria-live="polite">
          {form.bio.length}/{BIO_MAX}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className={eyebrowClass}>Quem vê sua foto</span>
        <Segmented
          label="Quem vê sua foto"
          options={AVATAR_VISIBILITY_OPTIONS}
          value={form.visibility}
          onChange={(v) => set('visibility', v)}
        />
        <span className={hintClass}>{avatarVisibilityText(form.visibility)}</span>
      </div>

      <div className="flex flex-col gap-2">
        <span className={eyebrowClass}>Prévia na comunidade</span>
        <div className="flex flex-col gap-2.5 rounded-card bg-card p-4">
          <div className="flex items-center gap-2">
            <UserAvatar name={form.name || me.name} url={me.avatarUrl} size={28} />
            <b className="text-sm text-foreground">{preview}</b>
            <span className={hintClass}>agora</span>
          </div>
          <span className="text-sm text-foreground">Fechei mais uma semana de treino!</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={labelClass}>E-mail</span>
        <div className={`${fieldClass} flex h-[52px] items-center text-muted-foreground`}>
          {me.email}
        </div>
        <span className={hintClass}>Para trocar o e-mail, fale com o suporte.</span>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="perfil-whatsapp" className={labelClass}>
          WhatsApp
        </label>
        <input
          id="perfil-whatsapp"
          className={`${fieldClass} h-[52px]`}
          inputMode="tel"
          autoComplete="tel"
          placeholder="(65) 99999-9999"
          value={form.whatsapp}
          onChange={(e) => set('whatsapp', e.target.value)}
        />
      </div>

      <button
        type="button"
        aria-pressed={form.optIn}
        disabled={!form.whatsapp.trim()}
        onClick={() => set('optIn', !form.optIn)}
        className="flex items-center gap-3 rounded-card bg-card p-4 text-left disabled:opacity-60"
      >
        <Icon name="whats" size={20} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] text-foreground">Equipe pode me chamar no WhatsApp</b>
          <span className={hintClass}>
            {whatsappOptInText(form.optIn && !!form.whatsapp.trim())}
          </span>
        </span>
        <ToggleTrack on={form.optIn && !!form.whatsapp.trim()} />
      </button>

      <p className={hintClass}>
        O Fatia não tem chat entre pessoas. Conversas com a equipe ficam no WhatsApp.
      </p>
    </form>
  );
}
