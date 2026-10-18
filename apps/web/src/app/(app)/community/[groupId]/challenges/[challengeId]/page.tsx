'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Info, Trophy } from 'lucide-react';
import {
  ApiError,
  challengePeriod,
  challengesApi,
  DISPLAY_NAME_MAX,
  displayNameProblem,
  METRIC_INFO,
  participantsLabel,
  rankLabel,
  scoreLabel,
  type ChallengeDetail,
} from '@fatia/api-client';
import {
  ChallengeStatusBadge,
  Leaderboard,
  MedalBadge,
} from '@/components/challenges/challenge-ui';
import { communityKeys } from '@/components/community/query-keys';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { Button, buttonVariants } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

/**
 * Um desafio da comunidade (Fase 8a): o que mede, quando, e o ranking — que só
 * aparece para quem entrou (ADR 027). Entrar pede o apelido; sair vale até o
 * fim.
 */
export default function CommunityChallengePage() {
  const { groupId, challengeId } = useParams<{ groupId: string; challengeId: string }>();
  const qc = useQueryClient();
  const [entrando, setEntrando] = useState(false);
  const [saindo, setSaindo] = useState(false);

  const desafio = useQuery({
    queryKey: communityKeys.challenge(groupId, challengeId),
    queryFn: () => challengesApi.get(groupId, challengeId),
    retry: false,
  });
  useTopBarTitle(desafio.data?.title);

  const atualizar = (d: ChallengeDetail) => {
    qc.setQueryData(communityKeys.challenge(groupId, challengeId), d);
    void qc.invalidateQueries({ queryKey: communityKeys.challenges(groupId), exact: true });
  };

  const entrar = useMutation({
    mutationFn: (apelido: string) => challengesApi.join(groupId, challengeId, apelido),
    onSuccess: (d) => {
      atualizar(d);
      setEntrando(false);
      toast('Você entrou no desafio.');
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para entrar agora.')),
  });

  const sair = useMutation({
    mutationFn: () => challengesApi.leave(groupId, challengeId),
    onSuccess: () => {
      setSaindo(false);
      toast('Você saiu do desafio.');
      void qc.invalidateQueries({ queryKey: communityKeys.challenge(groupId, challengeId) });
      void qc.invalidateQueries({ queryKey: communityKeys.challenges(groupId), exact: true });
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para sair agora.')),
  });

  if (desafio.isPending) return <Skeleton className="m-4 h-64 rounded-2xl bg-card" />;
  if (!desafio.data) {
    return (
      <div className="p-4">
        <EmptyState
          icon={Trophy}
          title="Desafio não encontrado"
          description="Ele pode ter sido apagado, ou você não está mais na comunidade."
          action={
            <Link
              href={`/community/${groupId}/challenges`}
              className={buttonVariants({ variant: 'outline' })}
            >
              Ver os desafios
            </Link>
          }
        />
      </div>
    );
  }

  const c = desafio.data;
  const info = METRIC_INFO[c.metric];
  const aberto = c.status !== 'ended';

  return (
    <div className="space-y-5 p-4">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <ChallengeStatusBadge challenge={c} />
          <span className="text-xs text-muted-foreground">
            {`${challengePeriod(c)} · ${participantsLabel(c.participants)}`}
          </span>
        </div>
        <p className="text-sm font-semibold">{info.label}</p>
        <p className="text-sm text-muted-foreground">{info.explain}</p>
        {c.description && <p className="whitespace-pre-line text-sm">{c.description}</p>}
        {c.endedEarly && (
          <p className="text-xs text-muted-foreground">
            A equipe encerrou o desafio antes da data.
          </p>
        )}
      </section>

      {c.me ? (
        <section
          aria-labelledby="minha-posicao"
          className="space-y-1 rounded-2xl border border-subtle bg-card p-4"
        >
          <h2 id="minha-posicao" className="text-xs font-semibold text-muted-foreground">
            {`Você, como ${c.me.displayName}`}
          </h2>
          <p className="flex flex-wrap items-center gap-3 text-lg font-semibold">
            {scoreLabel(c.metric, c.me.score)}
            {rankLabel(c.me.rank) && (
              <span className="text-sm text-muted-foreground">{rankLabel(c.me.rank)}</span>
            )}
            {c.me.medal && <MedalBadge medal={c.me.medal} />}
          </p>
        </section>
      ) : aberto ? (
        <section className="space-y-3 rounded-2xl border border-subtle bg-card p-4">
          <p className="text-sm">
            O ranking aparece para quem participa. Os outros participantes veem seu apelido e sua
            pontuação, e nada além disso.
          </p>
          <Button onClick={() => setEntrando(true)}>Participar</Button>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          Este desafio terminou. O ranking ficou para quem participou.
        </p>
      )}

      {c.leaderboard && (
        <section className="space-y-2" aria-labelledby="ranking">
          <h2 id="ranking" className="text-sm font-semibold">
            Ranking
          </h2>
          {c.status === 'upcoming' && (
            <p className="text-xs text-muted-foreground">A contagem começa no primeiro dia.</p>
          )}
          <Leaderboard challenge={c} entries={c.leaderboard} />
          <p className="text-xs text-muted-foreground">Atualiza a cada poucos minutos.</p>
        </section>
      )}

      {c.me && aberto && (
        <Button variant="outline" className="w-full text-danger" onClick={() => setSaindo(true)}>
          Sair do desafio
        </Button>
      )}

      {entrando && (
        <EntrarNoDesafio
          desafio={c}
          pending={entrar.isPending}
          onCancel={() => setEntrando(false)}
          onConfirm={(apelido) => entrar.mutate(apelido)}
        />
      )}

      <ConfirmDialog
        open={saindo}
        onOpenChange={setSaindo}
        title="Sair do desafio?"
        description="Seu apelido e sua pontuação saem do ranking. Dá para entrar de novo enquanto ele não acabar."
        confirmLabel="Sair"
        pendingLabel="Saindo..."
        pending={sair.isPending}
        onConfirm={() => sair.mutate()}
      />
    </div>
  );
}

function EntrarNoDesafio({
  desafio,
  pending,
  onCancel,
  onConfirm,
}: {
  desafio: ChallengeDetail;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (apelido: string) => void;
}) {
  const [apelido, setApelido] = useState(desafio.suggestedDisplayName);
  const problema = displayNameProblem(apelido);
  const info = METRIC_INFO[desafio.metric];
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onCancel()}>
      <DialogContent className="max-w-sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!problema) onConfirm(apelido.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>{`Participar de ${desafio.title}`}</DialogTitle>
            <DialogDescription>
              Os outros participantes veem seu apelido e sua pontuação. Você pode sair enquanto o
              desafio não acabar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="apelido">Como aparecer no ranking</Label>
            <Input
              id="apelido"
              value={apelido}
              maxLength={DISPLAY_NAME_MAX}
              onChange={(e) => setApelido(e.target.value)}
              aria-invalid={Boolean(problema)}
              aria-describedby="apelido-ajuda"
            />
            <p id="apelido-ajuda" className="text-xs text-muted-foreground">
              Vale para os próximos desafios desta comunidade também.
            </p>
          </div>
          {info.usesOwnGoal && (
            <p className="flex gap-2 rounded-xl bg-muted p-3 text-xs">
              <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
              Conta pela sua meta de nutrição, sem mostrar quanto você comeu. Sem meta definida, os
              dias não contam: confira em Nutrição › Metas.
            </p>
          )}
          {problema && (
            <p role="alert" className="text-sm text-destructive">
              {problema}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={Boolean(problema) || pending}>
              {pending ? 'Entrando...' : 'Participar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
