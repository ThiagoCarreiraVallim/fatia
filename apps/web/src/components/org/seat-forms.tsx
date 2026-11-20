'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Minus, Plus } from 'lucide-react';
import {
  ApiError,
  challengesApi,
  formatBRL,
  orgApi,
  programPreviewCents,
  seatAdjustPreview,
  seatProgramsApi,
  seatsApi,
  type CreateSeatProgramInput,
  type SeatsOverview,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { Textarea } from '@/components/ui/textarea';

export function apiErrorText(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

/** Hoje em Brasília, `YYYY-MM-DD` (o provedor conta os dias lá). */
function hojeLocal(): string {
  return new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
}

function somaDias(ymd: string, dias: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Ajustar assentos" (Pn-07): a quantidade com mínimo no que está em uso, o
 * valor mensal novo e, no aumento, o proporcional que sai agora. Reduzir vale
 * na renovação. Cancelar fica no pé, com confirmação na tela.
 */
export function SeatAdjustForm({
  groupId,
  overview,
  onDone,
  onCancelSeats,
}: {
  groupId: string;
  overview: SeatsOverview;
  onDone: () => void;
  onCancelSeats: () => void;
}) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState(String(overview.pool?.seats ?? 1));
  const seats = Number(texto.replace(/\D/g, '')) || 0;
  const p = seatAdjustPreview(overview, seats);
  const igual = seats === overview.pool?.seats;
  const salvar = useMutation({
    mutationFn: () => seatsApi.update(groupId, seats),
    onSuccess: () => {
      toast('Assentos atualizados.');
      void qc.invalidateQueries({ queryKey: orgKeys.all(groupId) });
      onDone();
    },
    onError: (err) => toast(apiErrorText(err, 'Não deu para mudar os assentos agora.')),
  });
  const passo = (d: number) => setTexto(String(Math.min(p.max, Math.max(p.min, seats + d))));

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (p.ok && !igual) salvar.mutate();
      }}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <Label htmlFor="assentos-ajuste">Assentos</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Menos um assento"
              onClick={() => passo(-1)}
            >
              <Minus size={16} aria-hidden />
            </Button>
            <Input
              id="assentos-ajuste"
              inputMode="numeric"
              className="w-28 text-center tabular-nums"
              value={texto}
              onChange={(e) => setTexto(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Mais um assento"
              onClick={() => passo(1)}
            >
              <Plus size={16} aria-hidden />
            </Button>
          </div>
          {!p.ok && (
            <p className="text-xs text-danger">
              {seats > p.max ? `Máximo ${p.max} assentos.` : `Mínimo ${p.min}: o que está em uso.`}
            </p>
          )}
        </div>
        {p.ok && (
          <div className="space-y-1 rounded-2xl border border-subtle bg-card p-3 text-sm">
            <p className="font-semibold tabular-nums">{`${p.monthly} por mês`}</p>
            {p.proRata && (
              <p className="text-muted-foreground">{`Agora: ${p.proRata} proporcional aos dias que faltam`}</p>
            )}
            {p.hint && <p className="text-xs text-muted-foreground">{p.hint}</p>}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          O pagamento é pelo Asaas. Quem sai devolve o assento; falta de pagamento só pausa a IA,
          nunca apaga registro.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
        <Button
          type="button"
          variant="ghost"
          className="mr-auto text-danger"
          onClick={onCancelSeats}
        >
          Cancelar assentos
        </Button>
        <Button type="submit" disabled={!p.ok || igual || salvar.isPending}>
          {salvar.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </form>
  );
}

/**
 * Novo programa (#403, Pn-07): PRO por um período para uma turma (quem o dono
 * escolhe) ou um desafio (quem entrar, até acabarem os assentos). O valor sai
 * antes de criar; a cobrança é avulsa, no Asaas.
 */
export function ProgramForm({
  groupId,
  unitPriceCents,
  onDone,
}: {
  groupId: string;
  unitPriceCents: number;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const hoje = hojeLocal();
  const [nome, setNome] = useState('');
  const [nota, setNota] = useState('');
  const [tipo, setTipo] = useState<'CLASS' | 'CHALLENGE'>('CLASS');
  const [quem, setQuem] = useState<string[]>([]);
  const [desafio, setDesafio] = useState('');
  const [vagas, setVagas] = useState('10');
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(somaDias(hoje, 29));

  const membros = useQuery({
    queryKey: orgKeys.members(groupId),
    queryFn: () => orgApi.members(groupId),
  });
  const desafios = useQuery({
    queryKey: orgKeys.challengesList(groupId),
    queryFn: () => challengesApi.list(groupId),
    enabled: tipo === 'CHALLENGE',
  });
  const elegiveis = (membros.data ?? []).filter(
    (m) => m.status === 'ACTIVE' && m.role === 'MEMBER',
  );
  const abertos = (desafios.data?.challenges ?? []).filter((c) => c.status !== 'ended');

  const seats = tipo === 'CLASS' ? quem.length : Number(vagas) || 0;
  const datasOk = DIA.test(inicio) && DIA.test(fim) && fim >= inicio;
  const ok = nome.trim().length > 0 && seats > 0 && datasOk && (tipo === 'CLASS' || desafio !== '');
  const meses = datasOk ? Math.max(1, Math.ceil((dias(inicio, fim) + 1) / 31)) : 1;
  const total = datasOk && seats > 0 ? programPreviewCents(seats, unitPriceCents, inicio, fim) : 0;

  const criar = useMutation({
    mutationFn: () => {
      const input: CreateSeatProgramInput = {
        name: nome.trim(),
        ...(nota.trim() ? { note: nota.trim() } : {}),
        kind: tipo,
        seats,
        startDate: inicio,
        endDate: fim,
        ...(tipo === 'CLASS' ? { membershipIds: quem } : { challengeId: desafio }),
      };
      return seatProgramsApi.create(groupId, input);
    },
    onSuccess: () => {
      toast('Programa criado.');
      void qc.invalidateQueries({ queryKey: orgKeys.all(groupId) });
      onDone();
    },
    onError: (err) => toast(apiErrorText(err, 'Não deu para criar o programa agora.')),
  });

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) criar.mutate();
      }}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <Label htmlFor="programa-nome">Nome</Label>
          <Input
            id="programa-nome"
            value={nome}
            maxLength={80}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Verão 21"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="programa-nota">Observação (opcional)</Label>
          <Textarea
            id="programa-nota"
            value={nota}
            maxLength={120}
            rows={2}
            onChange={(e) => setNota(e.target.value)}
            placeholder="turma das 6h · Helena"
          />
        </div>
        <Segmented
          label="Para quem"
          value={tipo}
          onChange={setTipo}
          options={[
            { value: 'CLASS', label: 'Turma' },
            { value: 'CHALLENGE', label: 'Desafio' },
          ]}
        />
        {tipo === 'CLASS' ? (
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Quem ganha o assento</legend>
            {elegiveis.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {membros.isPending ? 'Carregando membros...' : 'Nenhum membro ativo ainda.'}
              </p>
            ) : (
              <ul className="max-h-60 divide-y divide-subtle overflow-y-auto rounded-2xl border border-subtle bg-card">
                {elegiveis.map((m) => (
                  <li key={m.membershipId}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[hsl(var(--primary))]"
                        checked={quem.includes(m.membershipId)}
                        onChange={(e) =>
                          setQuem((q) =>
                            e.target.checked
                              ? [...q, m.membershipId]
                              : q.filter((x) => x !== m.membershipId),
                          )
                        }
                      />
                      {m.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="programa-desafio">Desafio</Label>
              <select
                id="programa-desafio"
                value={desafio}
                onChange={(e) => setDesafio(e.target.value)}
                className="h-11 w-full rounded-field bg-card px-3 text-sm shadow-[inset_0_0_0_1px_hsl(var(--border))]"
              >
                <option value="">Escolha</option>
                {abertos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="programa-vagas">Até</Label>
              <Input
                id="programa-vagas"
                inputMode="numeric"
                value={vagas}
                onChange={(e) => setVagas(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="programa-inicio">Começa</Label>
            <Input
              id="programa-inicio"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="programa-fim">Termina</Label>
            <Input
              id="programa-fim"
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
            />
          </div>
        </div>
        {seats > 0 && datasOk && (
          <p className="rounded-2xl border border-subtle bg-card p-3 text-sm tabular-nums">
            {`${seats} ${seats === 1 ? 'assento' : 'assentos'} × ${formatBRL(unitPriceCents)}${meses > 1 ? ` × ${meses} meses` : ''} · ${formatBRL(total)}`}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Os assentos do programa são à parte dos da comunidade e valem só nas datas. No fim, a
          pessoa volta ao Free sem perder nada.
        </p>
      </div>
      <div className="flex justify-end border-t border-border p-3">
        <Button type="submit" disabled={!ok || criar.isPending}>
          {criar.isPending ? 'Criando...' : 'Criar programa'}
        </Button>
      </div>
    </form>
  );
}

function dias(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
