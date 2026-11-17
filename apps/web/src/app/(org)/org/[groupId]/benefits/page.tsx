'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Gift, Plus, X } from 'lucide-react';
import {
  ApiError,
  benefitDraftToInput,
  benefitInitials,
  benefitsApi,
  benefitToDraft,
  benefitValidity,
  emptyBenefitDraft,
  type BenefitDraft,
  type BenefitDraftErrors,
  type BenefitKind,
  type TeamBenefit,
} from '@fatia/api-client';
import { ImageField, type ImageValue } from '@/components/content/image-field';
import { orgKeys } from '@/components/community/query-keys';
import { useOrgGroup } from '@/components/org/org-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const PRIVACY =
  'Sem benefício ativo, a seção some do app. O Fatia não rastreia compras nem passa dados dos membros ao parceiro.';

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

/** `YYYY-MM-DD` de hoje no fuso da comunidade: a validade vale até o fim desse dia lá. */
function todayIn(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, dateStyle: 'short' }).format(new Date());
}

function Initials({ name, url, size = 40 }: { name: string; url: string | null; size?: number }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage, sem otimizador.
      <img
        src={url}
        alt=""
        style={{ width: size, height: size }}
        className="shrink-0 rounded-xl object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-xl bg-brand font-display text-xs font-bold text-brand-foreground"
    >
      {benefitInitials(name || '?')}
    </span>
  );
}

type Edicao = { id: string | null; logo: ImageValue | null };

function BenefitForm({
  groupId,
  edicao,
  today,
  pending,
  onCancel,
  onSave,
  onRemove,
  draft,
  setDraft,
  setLogo,
}: {
  groupId: string;
  edicao: Edicao;
  today: string;
  pending: boolean;
  onCancel: () => void;
  onSave: (errors: BenefitDraftErrors | null) => void;
  onRemove: () => void;
  draft: BenefitDraft;
  setDraft: (d: BenefitDraft) => void;
  setLogo: (v: ImageValue | null) => void;
}) {
  const [errors, setErrors] = useState<BenefitDraftErrors>({});
  const set = <K extends keyof BenefitDraft>(k: K, v: BenefitDraft[K]) => {
    setDraft({ ...draft, [k]: v });
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const preview = {
    validUntil: draft.validUntil || today,
    expired: false,
  };

  return (
    <form
      aria-label="Benefício de parceiro"
      className="space-y-4 rounded-card bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const r = benefitDraftToInput(draft, today);
        setErrors(r.ok ? {} : r.errors);
        onSave(r.ok ? null : r.errors);
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">
          {edicao.id ? 'Editar benefício' : 'Benefício de parceiro'}
        </h2>
        <Button type="button" size="icon" variant="ghost" aria-label="Fechar" onClick={onCancel}>
          <X size={18} aria-hidden />
        </Button>
      </div>

      <ImageField
        groupId={groupId}
        purpose="benefit_logo"
        label="Logo do parceiro (opcional)"
        aspect="aspect-square"
        value={edicao.logo}
        onChange={(v) => {
          setLogo(v);
          setDraft({ ...draft, logoFileId: v?.fileId ?? null });
        }}
      />

      <div className="space-y-1">
        <Label htmlFor="b-parceiro">Parceiro</Label>
        <Input
          id="b-parceiro"
          maxLength={80}
          value={draft.partnerName}
          onChange={(e) => set('partnerName', e.target.value)}
          aria-invalid={!!errors.partnerName}
        />
        {errors.partnerName && <p className="text-xs text-danger">{errors.partnerName}</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="b-desconto">Desconto</Label>
        <Input
          id="b-desconto"
          maxLength={80}
          placeholder="15% em suplementos"
          value={draft.discountText}
          onChange={(e) => set('discountText', e.target.value)}
          aria-invalid={!!errors.discountText}
        />
        {errors.discountText && <p className="text-xs text-danger">{errors.discountText}</p>}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Como usar</p>
        <Segmented<BenefitKind>
          label="Como usar"
          options={[
            { value: 'COUPON', label: 'Cupom' },
            { value: 'LINK', label: 'Link' },
          ]}
          value={draft.kind}
          onChange={(k) => set('kind', k)}
        />
      </div>
      {draft.kind === 'COUPON' ? (
        <div className="space-y-1">
          <Label htmlFor="b-cupom">Código do cupom</Label>
          <Input
            id="b-cupom"
            maxLength={40}
            autoCapitalize="characters"
            className="font-mono uppercase"
            value={draft.couponCode}
            onChange={(e) => set('couponCode', e.target.value)}
            aria-invalid={!!errors.couponCode}
          />
          {errors.couponCode && <p className="text-xs text-danger">{errors.couponCode}</p>}
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="b-link">Link do parceiro</Label>
          <Input
            id="b-link"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={draft.url}
            onChange={(e) => set('url', e.target.value)}
            aria-invalid={!!errors.url}
          />
          {errors.url && <p className="text-xs text-danger">{errors.url}</p>}
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="b-validade">Validade</Label>
        <Input
          id="b-validade"
          type="date"
          min={today}
          value={draft.validUntil}
          onChange={(e) => set('validUntil', e.target.value)}
          aria-invalid={!!errors.validUntil}
        />
        {errors.validUntil ? (
          <p className="text-xs text-danger">{errors.validUntil}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Depois da validade o benefício sai sozinho do app.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="eyebrow">Prévia no app</p>
        <div aria-label="Prévia no app" className="space-y-3 rounded-2xl bg-surface-3 p-4">
          <div className="flex items-center gap-3">
            <Initials name={draft.partnerName} url={edicao.logo?.url ?? null} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{draft.partnerName || 'Parceiro'}</p>
              <p className="text-xs text-muted-foreground">
                {`${draft.discountText || 'Desconto'} · ${benefitValidity(preview)}`}
              </p>
            </div>
          </div>
          {draft.kind === 'COUPON' ? (
            <p className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-semibold text-brand-foreground">
              <Copy size={14} aria-hidden />
              {`Copiar código ${draft.couponCode.trim().toUpperCase() || '…'}`}
            </p>
          ) : (
            <p className="flex h-10 items-center justify-center rounded-xl border border-border text-sm font-semibold">
              Visitar o site
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Abre fora do app. O Fatia não recebe dado da compra.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        {edicao.id && (
          <Button type="button" variant="ghost" className="ml-auto text-danger" onClick={onRemove}>
            Remover
          </Button>
        )}
      </div>
    </form>
  );
}

/**
 * Benefícios de parceiros pelo dono (Pn-28): a tabela dos descontos, o painel
 * lateral para cadastrar ou editar com a prévia de como o membro vê, e remover
 * com confirmação. A academia combina com o parceiro; o Fatia só mostra.
 */
export default function OrgBenefitsPage() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const today = useMemo(() => todayIn(g.timezone), [g.timezone]);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [draft, setDraft] = useState<BenefitDraft>(() => emptyBenefitDraft(today));
  const [apagar, setApagar] = useState<TeamBenefit | null>(null);

  const lista = useQuery({
    queryKey: orgKeys.benefits(g.id),
    queryFn: () => benefitsApi.manage(g.id),
  });
  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: orgKeys.benefits(g.id) });
    void qc.invalidateQueries({ queryKey: ['community', 'benefits', g.id] });
  };

  const salvar = useMutation({
    mutationFn: async () => {
      const r = benefitDraftToInput(draft, today);
      if (!r.ok) throw new Error('invalid');
      return edicao?.id
        ? benefitsApi.update(g.id, edicao.id, r.input)
        : benefitsApi.create(g.id, r.input);
    },
    onSuccess: () => {
      setEdicao(null);
      toast('Benefício salvo · aparece em Comunidade → Benefícios');
      recarregar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para salvar o benefício agora.')),
  });
  const remover = useMutation({
    mutationFn: (id: string) => benefitsApi.remove(g.id, id),
    onSuccess: () => {
      setApagar(null);
      setEdicao(null);
      toast('Benefício removido.');
      recarregar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para remover agora.')),
  });

  function novo() {
    setDraft(emptyBenefitDraft(today));
    setEdicao({ id: null, logo: null });
  }
  function editar(b: TeamBenefit) {
    setDraft(benefitToDraft(b));
    setEdicao({ id: b.id, logo: b.logoFileId ? { fileId: b.logoFileId, url: b.logoUrl } : null });
  }

  const emEdicao = lista.data?.find((b) => b.id === edicao?.id) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-h3 font-bold">Benefícios de parceiros</h1>
          <p className="text-sm text-muted-foreground">
            Descontos para os membros. A academia combina com o parceiro; o Fatia só mostra.
          </p>
        </div>
        {lista.data && lista.data.length > 0 && (
          <Button className="gap-1" onClick={novo}>
            <Plus size={16} aria-hidden /> Benefício
          </Button>
        )}
      </div>

      <div className={cn('grid gap-4', edicao && 'lg:grid-cols-[minmax(0,1fr)_440px]')}>
        <div className="min-w-0 space-y-3">
          {lista.isPending && <Skeleton className="h-40 rounded-card bg-card" />}
          {lista.isError && (
            <p role="alert" className="text-sm text-danger">
              Não deu para carregar os benefícios.{' '}
              <button type="button" className="underline" onClick={() => lista.refetch()}>
                Tentar novamente
              </button>
            </p>
          )}
          {lista.data && lista.data.length === 0 && (
            <EmptyState
              icon={Gift}
              title="Nenhum benefício ainda"
              description="Cadastre um desconto que a academia combinou com um parceiro. Os membros veem em Comunidade → Benefícios."
              action={
                <Button className="gap-1" onClick={novo}>
                  <Plus size={16} aria-hidden /> Adicionar benefício
                </Button>
              }
            />
          )}
          {lista.data && lista.data.length > 0 && (
            <div className="overflow-x-auto rounded-card bg-card">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Parceiro</th>
                    <th className="px-4 py-3 font-medium">Desconto</th>
                    <th className="px-4 py-3 font-medium">Cupom ou link</th>
                    <th className="px-4 py-3 font-medium">Validade</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lista.data.map((b) => {
                    const ativo = b.status === 'active';
                    return (
                      <tr key={b.id} className={cn(!ativo && 'opacity-55')}>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2.5">
                            <Initials name={b.partnerName} url={b.logoUrl} size={32} />
                            <span className="font-semibold">{b.partnerName}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">{b.discountText}</td>
                        <td className="max-w-[220px] px-4 py-3">
                          <span className="text-xs text-muted-foreground">
                            {b.kind === 'COUPON' ? 'cupom' : 'link'}
                          </span>{' '}
                          <span className="break-all font-mono text-xs">
                            {b.kind === 'COUPON' ? b.couponCode : b.url?.replace(/^https:\/\//, '')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {benefitValidity({ validUntil: b.validUntil, expired: !ativo })}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={ativo ? 'done' : 'pending'}>
                            {ativo ? 'ativo' : 'expirado'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Editar ${b.partnerName}`}
                            onClick={() => editar(b)}
                          >
                            Editar
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{PRIVACY}</p>
        </div>

        {edicao && (
          <BenefitForm
            key={edicao.id ?? 'novo'}
            groupId={g.id}
            edicao={edicao}
            today={today}
            pending={salvar.isPending}
            draft={draft}
            setDraft={setDraft}
            setLogo={(logo) => setEdicao({ ...edicao, logo })}
            onCancel={() => setEdicao(null)}
            onSave={(errors) => {
              if (!errors) salvar.mutate();
            }}
            onRemove={() => emEdicao && setApagar(emEdicao)}
          />
        )}
      </div>

      <ConfirmDialog
        open={!!apagar}
        onOpenChange={(o) => !o && setApagar(null)}
        title={apagar ? `Remover ${apagar.partnerName}?` : 'Remover benefício?'}
        description="O benefício sai do app na hora. Os membros que já copiaram o cupom continuam com ele."
        confirmLabel="Remover"
        pendingLabel="Removendo..."
        pending={remover.isPending}
        onConfirm={() => apagar && remover.mutate(apagar.id)}
      />
    </div>
  );
}
