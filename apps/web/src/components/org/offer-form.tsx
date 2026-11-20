'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  contentApi,
  offersApi,
  seatProgramsApi,
  type OfferInput,
  type OfferView,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { apiErrorText } from '@/components/org/seat-forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/** "149" → 14900; "149,90" → 14990; inválido → null. */
export function parsePriceCents(texto: string): number | null {
  const limpo = texto
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/\./g, '')
    .replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}

const reais = (cents: number) => (cents / 100).toFixed(2).replace('.', ',').replace(/,00$/, '');

const SELECT =
  'h-11 w-full rounded-field bg-card px-3 text-sm shadow-[inset_0_0_0_1px_hsl(var(--border))]';

/**
 * Criar ou editar uma oferta (#403, Pn-37). Liga um plano da comunidade e,
 * se quiser, um programa (o PRO por período de quem compra). Nada de cartão
 * passa por aqui: o pagamento é a página do Asaas.
 */
export function OfferForm({
  groupId,
  offer,
  onDone,
}: {
  groupId: string;
  offer?: OfferView;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState(offer?.title ?? '');
  const [descricao, setDescricao] = useState(offer?.description ?? '');
  const [preco, setPreco] = useState(offer ? reais(offer.priceCents) : '');
  const [vagas, setVagas] = useState(offer?.spots ? String(offer.spots) : '');
  const [inicio, setInicio] = useState(offer?.startDate ?? '');
  const [fim, setFim] = useState(offer?.endDate ?? '');
  const [plano, setPlano] = useState(offer?.planTemplate?.id ?? '');
  const [programa, setPrograma] = useState(offer?.program?.id ?? '');
  const [extras, setExtras] = useState(offer?.extras ?? '');
  const [entra, setEntra] = useState(offer?.grantsEntry ?? true);

  const planos = useQuery({
    queryKey: orgKeys.contentPlans(groupId),
    queryFn: () => contentApi.plans(groupId),
  });
  const programas = useQuery({
    queryKey: orgKeys.seatPrograms(groupId),
    queryFn: () => seatProgramsApi.list(groupId),
  });

  const cents = parsePriceCents(preco);
  const datasOk = (!inicio && !fim) || (!!inicio && (!fim || fim >= inicio));
  const ok = titulo.trim().length > 0 && cents !== null && cents >= 100 && datasOk;

  const salvar = useMutation({
    mutationFn: () => {
      const input: OfferInput & { title: string; priceCents: number } = {
        title: titulo.trim(),
        priceCents: cents ?? 0,
        description: descricao.trim() || null,
        spots: vagas ? Number(vagas) : null,
        startDate: inicio || null,
        endDate: fim || null,
        grantsEntry: entra,
        planTemplateId: plano || null,
        programId: programa || null,
        extras: extras.trim() || null,
      };
      return offer ? offersApi.update(groupId, offer.id, input) : offersApi.create(groupId, input);
    },
    onSuccess: () => {
      toast(offer ? 'Oferta salva.' : 'Rascunho criado. Publique quando estiver pronta.');
      void qc.invalidateQueries({ queryKey: orgKeys.offers(groupId) });
      onDone();
    },
    onError: (err) => toast(apiErrorText(err, 'Não deu para salvar a oferta agora.')),
  });

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) salvar.mutate();
      }}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <Label htmlFor="oferta-nome">Nome</Label>
          <Input
            id="oferta-nome"
            value={titulo}
            maxLength={80}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Verão 21"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="oferta-descricao">Descrição</Label>
          <Textarea
            id="oferta-descricao"
            value={descricao}
            maxLength={600}
            rows={3}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="oferta-preco">Preço (R$)</Label>
            <Input
              id="oferta-preco"
              inputMode="decimal"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              placeholder="149"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oferta-vagas">Vagas</Label>
            <Input
              id="oferta-vagas"
              inputMode="numeric"
              value={vagas}
              onChange={(e) => setVagas(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="sem limite"
            />
          </div>
        </div>
        {preco && (cents === null || cents < 100) && (
          <p className="text-xs text-danger">O preço mínimo é R$ 1.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="oferta-inicio">Começa</Label>
            <Input
              id="oferta-inicio"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oferta-fim">Termina</Label>
            <Input
              id="oferta-fim"
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="oferta-plano">Plano</Label>
          <select
            id="oferta-plano"
            className={SELECT}
            value={plano}
            onChange={(e) => setPlano(e.target.value)}
          >
            <option value="">Nenhum</option>
            {(planos.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="oferta-programa">Programa (PRO no período)</Label>
          <select
            id="oferta-programa"
            className={SELECT}
            value={programa}
            onChange={(e) => setPrograma(e.target.value)}
          >
            <option value="">Nenhum</option>
            {(programas.data ?? [])
              .filter((p) => p.status !== 'ENDED')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="oferta-extras">O que mais recebe</Label>
          <Input
            id="oferta-extras"
            value={extras}
            maxLength={200}
            onChange={(e) => setExtras(e.target.value)}
            placeholder="questionário de início"
          />
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[hsl(var(--primary))]"
            checked={entra}
            onChange={(e) => setEntra(e.target.checked)}
          />
          Quem compra entra na comunidade
        </label>
      </div>
      <div className="flex justify-end border-t border-border p-3">
        <Button type="submit" disabled={!ok || salvar.isPending}>
          {salvar.isPending ? 'Salvando...' : offer ? 'Salvar' : 'Salvar rascunho'}
        </Button>
      </div>
    </form>
  );
}
