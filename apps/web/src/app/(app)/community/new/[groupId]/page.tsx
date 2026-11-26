'use client';

import { useState, type RefObject } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { hexToHslTriplet } from '@fatia/design';
import {
  ApiError,
  BRAND_CONTRAST_OK,
  BRAND_SWATCHES,
  brandChoice,
  contentApi,
  groupsApi,
  IMAGE_MIMES,
  orgApi,
  panelHref,
  type MyGroup,
} from '@fatia/api-client';
import { CreateSteps } from '@/components/community/create-steps';
import { GroupAvatar } from '@/components/community/group-avatar';
import { orgKeys } from '@/components/community/query-keys';
import { useImageUpload } from '@/components/content/image-field';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Criar uma comunidade, passo 2 (#372, prancha Onb-C2): capa, logo e cor, com
 * a prévia ao vivo (Mural, Desafios). A cor passa pelo teste de contraste (ADR
 * 041): sem 4,5:1, o editor avisa e usa o tom mais escuro que passa, e é esse
 * tom que vai para a API. O verde do Fatia é recusado.
 */
export default function BrandStepPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const group = useQuery({
    queryKey: orgKeys.group(groupId),
    queryFn: () => groupsApi.get(groupId),
    retry: false,
  });

  if (group.isPending) {
    return (
      <div className="mx-auto max-w-xl space-y-3 px-4 pt-4">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-60 rounded-2xl" />
      </div>
    );
  }
  if (!group.data || group.data.role !== 'OWNER') {
    return (
      <div className="px-4 pt-8">
        <EmptyState
          icon={Lock}
          title="Marca indisponível"
          description="Só quem criou a comunidade escolhe a marca dela."
        />
      </div>
    );
  }
  return <BrandStep g={group.data} />;
}

function BrandStep({ g }: { g: MyGroup }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [picked, setPicked] = useState(g.brandColor ?? BRAND_SWATCHES[0]!.color);
  const choice = brandChoice(picked);
  const swatch = BRAND_SWATCHES.find((s) => s.color === picked.toLowerCase());

  const save = useMutation({
    mutationFn: () => orgApi.update(g.id, { brandColor: choice.color }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      router.replace(panelHref(g.id));
    },
    onError: (err) =>
      toast(
        err instanceof ApiError && err.status < 500
          ? err.message
          : 'Não deu para salvar a marca agora. Tente de novo.',
      ),
  });

  const style = choice.color
    ? ({
        ['--brand' as string]: hexToHslTriplet(choice.color),
        ['--brand-foreground' as string]: hexToHslTriplet(choice.ink ?? '#ffffff'),
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      style={style}
      className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-xl flex-col gap-5 px-4 pb-6 pt-4"
    >
      <CreateSteps step={2} />
      <h1 className="font-display text-[32px] font-extrabold leading-tight">
        A cara da sua comunidade
      </h1>

      <Preview g={g} />

      <div className="flex flex-col gap-2.5">
        <span id="cor" className="text-[13px] font-semibold text-muted-foreground">
          Cor
        </span>
        <div role="radiogroup" aria-labelledby="cor" className="flex flex-wrap gap-3">
          {BRAND_SWATCHES.map((s) => {
            const on = swatch?.color === s.color;
            return (
              <button
                key={s.color}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={s.label}
                onClick={() => setPicked(s.color)}
                className={cn(
                  'h-11 w-11 rounded-[14px] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on &&
                    'scale-105 shadow-[0_0_0_3px_hsl(var(--background)),0_0_0_5px_hsl(var(--foreground))]',
                )}
                style={{ background: s.color }}
              />
            );
          })}
          <label
            className={cn(
              'relative flex h-11 cursor-pointer items-center gap-2 rounded-[14px] bg-card px-3 text-[13px] font-semibold focus-within:ring-2 focus-within:ring-ring',
              !swatch && 'shadow-[inset_0_0_0_2px_hsl(var(--foreground))]',
            )}
          >
            <span
              aria-hidden
              className="h-5 w-5 rounded-full shadow-[inset_0_0_0_1px_hsl(var(--border))]"
              style={{ background: picked }}
            />
            Outra
            <input
              type="color"
              aria-label="Outra cor"
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>
        <p
          role="status"
          className={cn(
            'flex items-start gap-2 text-[13px]',
            choice.warning ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          <Icon name={choice.warning ? 'alert' : 'check'} size={16} className="mt-0.5 shrink-0" />
          <span className={choice.warning ? 'text-foreground' : undefined}>
            {choice.warning ?? BRAND_CONTRAST_OK}
          </span>
        </p>
      </div>

      <div className="flex-1" />
      <Button
        variant="brand"
        size="xl"
        full
        disabled={!choice.color || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? 'Salvando…' : 'Salvar e abrir o painel'}
      </Button>
    </div>
  );
}

/** A prévia: capa (ou a cor), o logo, o nome e as abas como o membro vai ver. */
function Preview({ g }: { g: MyGroup }) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ['community'] });
  const fail = (err: unknown) =>
    toast(
      err instanceof ApiError && err.status < 500
        ? err.message
        : 'Não deu para trocar a imagem agora.',
    );
  const cover = useMutation({
    mutationFn: (fileId: string | null) => orgApi.setCover(g.id, fileId),
    onSuccess: refresh,
    onError: fail,
  });
  const avatar = useMutation({
    mutationFn: (fileId: string | null) => contentApi.setAvatar(g.id, fileId),
    onSuccess: refresh,
    onError: fail,
  });
  const coverUp = useImageUpload(g.id, 'group_cover', (v) => cover.mutate(v.fileId));
  const avatarUp = useImageUpload(g.id, 'group_avatar', (v) => avatar.mutate(v.fileId));

  return (
    <section aria-label="Prévia da comunidade" className="overflow-hidden rounded-card bg-card">
      <div className="relative h-[120px]">
        {g.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta
          <img src={g.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            aria-hidden
            className="h-full w-full bg-[linear-gradient(170deg,hsl(var(--brand)),hsl(var(--brand)/0.35)_70%,hsl(var(--background)))]"
          />
        )}
        <button
          type="button"
          onClick={coverUp.pick}
          disabled={coverUp.enviando || cover.isPending}
          className="absolute right-3 top-3 flex h-9 items-center gap-1.5 rounded-[10px] bg-black/55 px-3 text-[13px] font-semibold text-white backdrop-blur hover:bg-black/70"
        >
          <Icon name="image" size={16} />
          {coverUp.enviando ? 'Enviando…' : 'Capa'}
        </button>
      </div>
      <div className="relative z-10 -mt-8 flex items-start gap-3 px-4 pb-4">
        <button
          type="button"
          aria-label={g.avatarUrl ? 'Trocar o logo' : 'Escolher o logo'}
          onClick={avatarUp.pick}
          disabled={avatarUp.enviando || avatar.isPending}
          className="shrink-0 rounded-[18px] ring-4 ring-card focus-visible:outline-none focus-visible:ring-ring"
        >
          {g.avatarUrl ? (
            <GroupAvatar name={g.name} url={g.avatarUrl} size={60} className="rounded-[16px]" />
          ) : (
            <span className="flex h-[60px] w-[60px] items-center justify-center rounded-[16px] bg-brand font-display text-xl font-extrabold text-brand-foreground">
              {initials(g.name)}
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1 pt-9">
          <b className="block truncate text-base">{g.name}</b>
          <div aria-hidden className="mt-1 flex gap-4 text-[13.5px]">
            <span className="border-b-2 border-brand pb-1 font-semibold">Mural</span>
            <span className="pb-1 text-muted-foreground">Desafios</span>
          </div>
        </div>
      </div>
      <HiddenFile inputRef={coverUp.input} onFile={coverUp.enviar} label="Capa da comunidade" />
      <HiddenFile inputRef={avatarUp.input} onFile={avatarUp.enviar} label="Logo da comunidade" />
    </section>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || '·'
  );
}

function HiddenFile({
  inputRef,
  onFile,
  label,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onFile: (file: File) => Promise<void>;
  label: string;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      aria-label={label}
      accept={IMAGE_MIMES.join(',')}
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void onFile(file);
      }}
    />
  );
}
