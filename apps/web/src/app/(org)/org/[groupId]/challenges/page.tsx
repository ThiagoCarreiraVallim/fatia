'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trophy } from 'lucide-react';
import {
  ApiError,
  CHALLENGE_DESCRIPTION_MAX,
  CHALLENGE_METRICS,
  CHALLENGE_TITLE_MAX,
  challengePeriod,
  challengeProblem,
  challengesApi,
  METRIC_INFO,
  participantsLabel,
  type Challenge,
  type ChallengeInput,
  type ChallengeMetric,
} from '@fatia/api-client';
import { ChallengeStatusBadge } from '@/components/challenges/challenge-ui';
import { communityKeys } from '@/components/community/query-keys';
import { useOrgGroup } from '@/components/org/org-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

type Edicao = { id: string | null; inicial: ChallengeInput };

/**
 * Desafios da comunidade pela equipe (Fase 8a, ADR 027): marcar, mudar antes de
 * começar, encerrar e apagar. O ranking é dos participantes; aqui a equipe vê
 * quantos entraram.
 */
export default function OrgChallengesPage() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [encerrar, setEncerrar] = useState<Challenge | null>(null);
  const [apagar, setApagar] = useState<Challenge | null>(null);
  const lista = useQuery({
    queryKey: communityKeys.challenges(g.id),
    queryFn: () => challengesApi.list(g.id),
  });
  const hoje = lista.data?.today ?? '';
  // A lista só: a chave dela é prefixo da do detalhe de cada desafio.
  const recarregar = () =>
    qc.invalidateQueries({ queryKey: communityKeys.challenges(g.id), exact: true });

  const salvar = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: ChallengeInput }) =>
      id ? challengesApi.update(g.id, id, input) : challengesApi.create(g.id, input),
    onSuccess: (_, { id }) => {
      setEdicao(null);
      toast(id ? 'Desafio atualizado.' : 'Desafio marcado.');
      void recarregar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para salvar o desafio agora.')),
  });
  const fim = useMutation({
    mutationFn: (id: string) => challengesApi.end(g.id, id),
    onSuccess: () => {
      setEncerrar(null);
      toast('Desafio encerrado. O ranking final ficou gravado.');
      void recarregar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para encerrar agora.')),
  });
  const remover = useMutation({
    mutationFn: (id: string) => challengesApi.remove(g.id, id),
    onSuccess: () => {
      setApagar(null);
      toast('Desafio apagado.');
      void recarregar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para apagar agora.')),
  });

  const novo = () =>
    setEdicao({
      id: null,
      inicial: { title: '', description: '', metric: 'ACTIVE_DAYS', startDate: hoje, endDate: '' },
    });

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Os membros escolhem se participam. O ranking de cada desafio aparece só para quem entrou,
        com o apelido de cada um; os de nutrição contam dias na meta de cada pessoa, nunca quanto
        ela comeu.
      </p>
      {!edicao && (
        <Button size="sm" onClick={novo} disabled={!lista.data}>
          <Plus className="h-4 w-4" aria-hidden />
          Novo desafio
        </Button>
      )}
      {edicao && (
        <ChallengeForm
          key={edicao.id ?? 'novo'}
          editando={edicao.id !== null}
          inicial={edicao.inicial}
          hoje={hoje}
          pending={salvar.isPending}
          onCancel={() => setEdicao(null)}
          onSave={(input) => salvar.mutate({ id: edicao.id, input })}
        />
      )}

      {lista.isPending ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : lista.data?.challenges.length ? (
        <ul className="space-y-2" aria-label="Desafios da comunidade">
          {lista.data.challenges.map((c) => (
            <li key={c.id} className="space-y-2 rounded-2xl border border-subtle bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{c.title}</span>
                <ChallengeStatusBadge challenge={c} />
              </div>
              <p className="text-xs text-muted-foreground">
                {`${METRIC_INFO[c.metric].label} · ${challengePeriod(c)} · ${participantsLabel(c.participants)}`}
              </p>
              {c.canManage && c.status !== 'ended' && (
                <div className="flex flex-wrap gap-2">
                  {c.status === 'upcoming' ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEdicao({
                            id: c.id,
                            inicial: {
                              title: c.title,
                              description: c.description ?? '',
                              metric: c.metric,
                              startDate: c.startDate,
                              endDate: c.endDate,
                            },
                          })
                        }
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-danger"
                        onClick={() => setApagar(c)}
                      >
                        Apagar
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setEncerrar(c)}>
                      Encerrar agora
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !edicao && (
          <EmptyState
            icon={Trophy}
            title="Nenhum desafio ainda"
            description="Marque um desafio de dias ativos, treinos, passos, água ou metas de nutrição."
          />
        )
      )}

      <ConfirmDialog
        open={encerrar !== null}
        onOpenChange={(aberto) => !aberto && setEncerrar(null)}
        title={`Encerrar ${encerrar?.title ?? 'o desafio'}?`}
        description="O ranking fecha com o que foi registrado até agora e as medalhas são entregues. Não dá para reabrir."
        confirmLabel="Encerrar"
        pendingLabel="Encerrando..."
        pending={fim.isPending}
        onConfirm={() => encerrar && fim.mutate(encerrar.id)}
      />
      <ConfirmDialog
        open={apagar !== null}
        onOpenChange={(aberto) => !aberto && setApagar(null)}
        title={`Apagar ${apagar?.title ?? 'o desafio'}?`}
        description="Ele ainda não começou: quem já entrou deixa de ver o desafio."
        confirmLabel="Apagar"
        pendingLabel="Apagando..."
        pending={remover.isPending}
        onConfirm={() => apagar && remover.mutate(apagar.id)}
      />
    </div>
  );
}

function ChallengeForm({
  editando,
  inicial,
  hoje,
  pending,
  onCancel,
  onSave,
}: {
  editando: boolean;
  inicial: ChallengeInput;
  hoje: string;
  pending: boolean;
  onCancel: () => void;
  onSave: (input: ChallengeInput) => void;
}) {
  const [titulo, setTitulo] = useState(inicial.title);
  const [descricao, setDescricao] = useState(inicial.description ?? '');
  const [metrica, setMetrica] = useState<ChallengeMetric>(inicial.metric);
  const [inicio, setInicio] = useState(inicial.startDate);
  const [fim, setFim] = useState(inicial.endDate);
  const input: ChallengeInput = {
    title: titulo.trim(),
    description: descricao.trim() || null,
    metric: metrica,
    startDate: inicio,
    endDate: fim,
  };
  const problema = challengeProblem(input, hoje);

  return (
    <form
      aria-labelledby="form-desafio"
      className="space-y-4 rounded-2xl border border-subtle bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problema) onSave(input);
      }}
    >
      <h2 id="form-desafio" className="text-sm font-semibold">
        {editando ? 'Editar desafio' : 'Novo desafio'}
      </h2>
      <div className="space-y-1">
        <Label htmlFor="desafio-titulo">Título</Label>
        <Input
          id="desafio-titulo"
          value={titulo}
          maxLength={CHALLENGE_TITLE_MAX}
          placeholder="Ex.: Outubro ativo"
          onChange={(e) => setTitulo(e.target.value)}
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">O que conta</legend>
        {CHALLENGE_METRICS.map((m) => (
          <label
            key={m}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-subtle p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <input
              type="radio"
              name="metrica"
              className="mt-1 accent-primary"
              checked={metrica === m}
              onChange={() => setMetrica(m)}
            />
            <span>
              <span className="block text-sm font-medium">{METRIC_INFO[m].label}</span>
              <span className="block text-xs text-muted-foreground">{METRIC_INFO[m].explain}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="desafio-inicio">Começa em</Label>
          <Input
            id="desafio-inicio"
            type="date"
            min={hoje}
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="desafio-fim">Termina em</Label>
          <Input
            id="desafio-fim"
            type="date"
            min={inicio || hoje}
            value={fim}
            onChange={(e) => setFim(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="desafio-descricao">Descrição (opcional)</Label>
        <Textarea
          id="desafio-descricao"
          rows={3}
          maxLength={CHALLENGE_DESCRIPTION_MAX}
          value={descricao}
          placeholder="Regras, prêmio, recado da equipe."
          onChange={(e) => setDescricao(e.target.value)}
        />
      </div>
      {problema && titulo.trim() !== '' && (
        <p role="alert" className="text-sm text-destructive">
          {problema}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={Boolean(problema) || pending}>
          {pending ? 'Salvando...' : editando ? 'Salvar' : 'Marcar desafio'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
