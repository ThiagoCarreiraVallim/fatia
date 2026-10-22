'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bot, ShieldCheck } from 'lucide-react';
import { AgentAvatar } from '@/components/chat/agente';
import {
  AGENT_INSTRUCTIONS_MAX,
  AGENT_NAME_MAX,
  ApiError,
  agentProblem,
  groupAgentApi,
  suggestedAgentName,
  type GroupAgent,
} from '@fatia/api-client';
import { ImageField, type ImageValue } from '@/components/content/image-field';
import { useOrgGroup } from '@/components/org/org-shell';
import { orgKeys } from '@/components/community/query-keys';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

/**
 * O agente da comunidade (Fase 7c, ADR 031), só do dono: nome, avatar e
 * orientações de tom e foco. Ligado, ele aparece para os membros no chat — e,
 * para quem tem assento pago pela comunidade, já vem escolhido.
 */
export default function OrgAgentPage() {
  const g = useOrgGroup();
  const agente = useQuery({
    queryKey: orgKeys.agent(g.id),
    queryFn: () => groupAgentApi.get(g.id),
    enabled: g.role === 'OWNER',
  });

  if (g.role !== 'OWNER') {
    return (
      <EmptyState
        icon={Bot}
        title="Só o dono configura o agente"
        description="Peça a quem é dono da comunidade para mudar o agente do chat."
      />
    );
  }
  if (agente.isError) {
    return (
      <EmptyState
        icon={Bot}
        title="Não deu para abrir o agente"
        description="Tente de novo em alguns instantes."
        action={
          <Button variant="outline" onClick={() => void agente.refetch()}>
            Tentar de novo
          </Button>
        }
      />
    );
  }
  if (!agente.data) return <Skeleton className="h-96 rounded-2xl" />;
  return <AgentForm atual={agente.data} />;
}

function AgentForm({ atual }: { atual: GroupAgent }) {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const [nome, setNome] = useState(atual.configured ? atual.name : suggestedAgentName(g.name));
  const [orientacoes, setOrientacoes] = useState(atual.instructions);
  const [ligado, setLigado] = useState(atual.configured ? atual.enabled : true);
  const [avatar, setAvatar] = useState<ImageValue | null>(
    atual.avatar ? { fileId: atual.avatar.id, url: atual.avatar.url } : null,
  );

  const problema = agentProblem({ name: nome, instructions: orientacoes });
  const avatarMudou = (avatar?.fileId ?? null) !== (atual.avatar?.id ?? null);
  const mudou =
    !atual.configured ||
    nome.trim() !== atual.name ||
    orientacoes.trim() !== atual.instructions ||
    ligado !== atual.enabled ||
    avatarMudou;

  const salvar = useMutation({
    mutationFn: () =>
      groupAgentApi.put(g.id, {
        name: nome.trim(),
        instructions: orientacoes.trim(),
        enabled: ligado,
        ...(avatarMudou ? { avatarFileId: avatar?.fileId ?? null } : {}),
      }),
    onSuccess: (salvo) => {
      qc.setQueryData(orgKeys.agent(g.id), salvo);
      toast(salvo.enabled ? 'Agente salvo e ligado no chat.' : 'Agente salvo. Ele está desligado.');
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para salvar o agente agora.')),
  });

  const avatarDaPrevia = avatar?.url ?? g.avatarUrl;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form
        aria-labelledby="agente"
        className="space-y-4 rounded-2xl border border-subtle bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problema) salvar.mutate();
        }}
      >
        <div>
          <h2 id="agente" className="text-sm font-semibold">
            Agente do chat
          </h2>
          <p className="text-xs text-muted-foreground">
            É o assistente que os membros encontram no chat da Fatia, com o nome e o jeito da{' '}
            {g.name}.
          </p>
        </div>

        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-subtle px-3 py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
          <span>
            <span className="block text-sm font-semibold">Ligado no chat</span>
            <span className="block text-xs text-muted-foreground">
              Desligado, os membros conversam com o assistente da Fatia.
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="h-5 w-5 accent-primary"
            checked={ligado}
            onChange={(e) => setLigado(e.target.checked)}
          />
        </label>

        <div className="space-y-1">
          <Label htmlFor="agente-nome">Nome</Label>
          <Input
            id="agente-nome"
            maxLength={AGENT_NAME_MAX}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            aria-describedby="agente-nome-ajuda"
          />
          <p id="agente-nome-ajuda" className="text-xs text-muted-foreground">
            {`Até ${AGENT_NAME_MAX} caracteres, numa linha.`}
          </p>
        </div>

        <ImageField
          groupId={g.id}
          purpose="agent_avatar"
          label="Avatar do agente"
          aspect="aspect-square max-w-32"
          value={avatar}
          onChange={setAvatar}
        />
        {!avatar && g.avatarUrl ? (
          <p className="-mt-2 text-xs text-muted-foreground">
            Sem avatar próprio, o agente usa o da comunidade.
          </p>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="agente-orientacoes">Orientações</Label>
          <Textarea
            id="agente-orientacoes"
            rows={8}
            maxLength={AGENT_INSTRUCTIONS_MAX}
            value={orientacoes}
            placeholder="Ex.: fale como a equipe da academia, de forma animada e direta. Sugira os planos prontos da casa e os exercícios que dá para fazer com os nossos aparelhos."
            onChange={(e) => setOrientacoes(e.target.value)}
            aria-describedby="agente-orientacoes-ajuda"
          />
          <p
            id="agente-orientacoes-ajuda"
            className="flex justify-between gap-2 text-xs text-muted-foreground"
          >
            <span>Tom, foco e o que recomendar.</span>
            <span aria-live="polite">{`${orientacoes.length}/${AGENT_INSTRUCTIONS_MAX}`}</span>
          </p>
        </div>

        {problema ? (
          <p role="alert" className="text-sm text-destructive">
            {problema}
          </p>
        ) : null}
        <Button type="submit" disabled={!mudou || Boolean(problema) || salvar.isPending}>
          {salvar.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </form>

      <div className="space-y-4">
        <section
          aria-labelledby="previa"
          className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
        >
          <h2 id="previa" className="text-sm font-semibold">
            Como aparece no chat
          </h2>
          <div className="flex items-center gap-3">
            <AgentAvatar url={avatarDaPrevia} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{nome.trim() || 'Sem nome'}</p>
              <p className="truncate text-xs text-muted-foreground">{`Agente da ${g.name}`}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {ligado
              ? 'Quem tem assento pago pela comunidade começa as conversas novas com ele. Os outros membros escolhem no chat.'
              : 'Desligado: não aparece para ninguém.'}
          </p>
        </section>

        <section
          aria-labelledby="limites"
          className="space-y-2 rounded-2xl border border-subtle bg-card p-4"
        >
          <h2 id="limites" className="flex items-center gap-1.5 text-sm font-semibold">
            <ShieldCheck size={16} aria-hidden className="text-primary" />O que as orientações não
            mudam
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>O agente só vê os dados de quem está conversando, nunca os de outro membro.</li>
            <li>Nada é gravado sem a pessoa aprovar na tela.</li>
            <li>Ele não dá diagnóstico, remédio nem dose, e não se passa por profissional.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
