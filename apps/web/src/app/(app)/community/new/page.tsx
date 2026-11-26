'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  canCreateCommunity,
  COMMUNITY_KIND_OPTIONS,
  COMMUNITY_SHORT_HOST,
  communitySlug,
  orgApi,
  setupApi,
  type CommunityKindOption,
} from '@fatia/api-client';
import { CreateSteps } from '@/components/community/create-steps';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Espera a pessoa parar de digitar antes de perguntar o endereço à API. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Criar uma comunidade, passo 1 (#372, prancha Onb-C1): o tipo, o nome e o
 * endereço `fat.ia.br/<slug>` gerado sem acento. "Criar" só com tipo e nome.
 * Daqui segue para a Marca (passo 2); os dois bloqueiam o painel.
 */
export default function NewCommunityPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const nameId = useId();
  const [kind, setKind] = useState<CommunityKindOption | null>(null);
  const [name, setName] = useState('');
  const ready = canCreateCommunity(kind, name);
  const asked = useDebounced(name.trim(), 350);

  const slug = useQuery({
    queryKey: ['community', 'slug-check', asked],
    queryFn: () => setupApi.slugCheck(asked),
    enabled: asked.length >= 2,
    staleTime: 30_000,
  });
  // Enquanto a API não responde, o endereço sai do nome (mesma regra).
  const shown =
    slug.data && asked === name.trim() ? slug.data.slug : communitySlug(name || 'sua comunidade');

  const create = useMutation({
    mutationFn: async () => {
      const o = COMMUNITY_KIND_OPTIONS.find((x) => x.key === kind)!;
      const nome = name.trim();
      // O endereço que foi mostrado; se a pergunta ainda não voltou, pergunta agora.
      const livre = slug.data && asked === nome ? slug.data : await setupApi.slugCheck(nome);
      return orgApi.create({
        name: nome,
        type: o.type,
        ...(o.kind ? { kind: o.kind } : {}),
        slug: livre.slug,
        joinPolicy: 'APPROVAL',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    },
    onSuccess: (g) => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      router.replace(`/community/new/${g.id}`);
    },
  });

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-xl flex-col gap-5 px-4 pb-6 pt-4">
      <div className="flex items-center gap-3">
        <CreateSteps step={1} />
      </div>
      <h1 className="font-display text-[32px] font-extrabold leading-tight">
        Que tipo de comunidade?
      </h1>

      <div role="radiogroup" aria-label="Tipo de comunidade" className="flex flex-col gap-2.5">
        {COMMUNITY_KIND_OPTIONS.map((o) => {
          const on = kind === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setKind(o.key)}
              className={cn(
                'flex items-center gap-4 rounded-card bg-card p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                on && 'bg-primary-soft shadow-[inset_0_0_0_2px_hsl(var(--primary))]',
              )}
            >
              <span
                aria-hidden
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-primary-soft text-primary"
              >
                <Icon name={o.icon} size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-base">{o.title}</b>
                <span className="block text-[13.5px] text-muted-foreground">{o.sub}</span>
              </span>
              <span
                aria-hidden
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong',
                )}
              >
                {on && <Icon name="check" size={14} />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-[13px] font-semibold text-muted-foreground">
          Nome
        </label>
        <Input
          id={nameId}
          value={name}
          maxLength={120}
          autoComplete="off"
          placeholder="Academia Demo"
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          {COMMUNITY_SHORT_HOST}/<b className="font-semibold text-foreground">{shown}</b>
          {slug.data?.taken && asked === name.trim() && (
            <span className="block">O endereço do nome já é de outra comunidade.</span>
          )}
        </p>
      </div>

      {create.isError && (
        <p role="alert" className="text-sm text-danger">
          {create.error instanceof ApiError && create.error.status < 500
            ? create.error.message
            : 'Não deu para criar agora. Tente de novo.'}
        </p>
      )}

      <div className="flex-1" />
      <Button size="xl" full disabled={!ready || create.isPending} onClick={() => create.mutate()}>
        {create.isPending ? 'Criando…' : 'Criar'}
      </Button>
    </div>
  );
}
