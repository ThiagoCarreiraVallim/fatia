import { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CHALLENGE_DESCRIPTION_MAX,
  CHALLENGE_METRICS,
  CHALLENGE_TITLE_MAX,
  challengePeriod,
  challengeProblem,
  challengesApi,
  METRIC_INFO,
  participantsLabel,
  type Challenge,
  type ChallengeMetric,
  type MyGroup,
} from '@fatia/api-client';
import { ChallengeStatusBadge } from '@/components/challenges/challenge-ui';
import {
  challengeWindow,
  type DurationChoice,
  type StartChoice,
} from '@/components/challenges/window-choice';
import { apiMessage, Choice, OrgPanel, PanelCard } from '@/components/org/org-panel';
import { Button, EmptyState, Input, LoadingState, useConfirm } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

/**
 * Marcar um desafio no app: começo e duração em escolhas prontas (hoje,
 * amanhã ou segunda; 7, 14 ou 30 dias). Datas livres ficam na web.
 */
function NovoDesafio({ g, hoje, onDone }: { g: MyGroup; hoje: string; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [metrica, setMetrica] = useState<ChallengeMetric>('ACTIVE_DAYS');
  const [inicio, setInicio] = useState<StartChoice>('tomorrow');
  const [duracao, setDuracao] = useState<DurationChoice>('7');
  const input = {
    title: titulo.trim(),
    description: descricao.trim() || null,
    metric: metrica,
    ...challengeWindow(hoje, inicio, duracao),
  };
  const problema = challengeProblem(input, hoje);
  const salvar = useMutation({
    mutationFn: () => challengesApi.create(g.id, input),
    onSuccess: () => {
      toast.show({ message: 'Desafio marcado.' });
      void qc.invalidateQueries({ queryKey: ['community', 'challenges', g.id], exact: true });
      onDone();
    },
    onError: (err) =>
      toast.show({ message: apiMessage(err, 'Não deu para marcar o desafio agora.') }),
  });

  return (
    <PanelCard title="Novo desafio">
      <Input
        value={titulo}
        onChangeText={setTitulo}
        maxLength={CHALLENGE_TITLE_MAX}
        accessibilityLabel="Título"
        placeholder="Título. Ex.: Outubro ativo"
      />
      <Choice
        label="O que conta"
        options={CHALLENGE_METRICS.map((m) => ({ value: m, label: METRIC_INFO[m].label }))}
        value={metrica}
        onChange={setMetrica}
      />
      <Text className="text-xs text-muted-foreground">{METRIC_INFO[metrica].explain}</Text>
      <Choice
        label="Começa"
        options={[
          { value: 'today', label: 'Hoje' },
          { value: 'tomorrow', label: 'Amanhã' },
          { value: 'monday', label: 'Segunda' },
        ]}
        value={inicio}
        onChange={setInicio}
      />
      <Choice
        label="Duração"
        options={[
          { value: '7', label: '7 dias' },
          { value: '14', label: '14 dias' },
          { value: '30', label: '30 dias' },
        ]}
        value={duracao}
        onChange={setDuracao}
      />
      <Text className="text-xs text-muted-foreground">{challengePeriod(input)}</Text>
      <Input
        value={descricao}
        onChangeText={setDescricao}
        maxLength={CHALLENGE_DESCRIPTION_MAX}
        multiline
        className="min-h-[80px]"
        textAlignVertical="top"
        accessibilityLabel="Descrição (opcional)"
        placeholder="Descrição (opcional): regras, prêmio, recado da equipe."
      />
      {problema && titulo.trim() ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {problema}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <Button variant="ghost" className="flex-1" onPress={onDone}>
          Cancelar
        </Button>
        <Button
          className="flex-1"
          disabled={Boolean(problema)}
          loading={salvar.isPending}
          onPress={() => salvar.mutate()}
        >
          Marcar
        </Button>
      </View>
    </PanelCard>
  );
}

function Desafios({ g }: { g: MyGroup }) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const toast = useToast();
  const [criando, setCriando] = useState(false);
  const lista = useQuery({
    queryKey: ['community', 'challenges', g.id],
    queryFn: () => challengesApi.list(g.id),
  });
  const recarregar = () =>
    qc.invalidateQueries({ queryKey: ['community', 'challenges', g.id], exact: true });
  const fim = useMutation({
    mutationFn: (id: string) => challengesApi.end(g.id, id),
    onSuccess: () => {
      toast.show({ message: 'Desafio encerrado. O ranking final ficou gravado.' });
      void recarregar();
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para encerrar agora.') }),
  });
  const remover = useMutation({
    mutationFn: (id: string) => challengesApi.remove(g.id, id),
    onSuccess: () => {
      toast.show({ message: 'Desafio apagado.' });
      void recarregar();
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para apagar agora.') }),
  });

  if (lista.isPending) return <LoadingState />;
  const desafios = lista.data?.challenges ?? [];
  const confirmar = (c: Challenge, acao: 'end' | 'remove') =>
    confirm({
      title: acao === 'end' ? `Encerrar ${c.title}?` : `Apagar ${c.title}?`,
      description:
        acao === 'end'
          ? 'O ranking fecha com o que foi registrado até agora e as medalhas são entregues. Não dá para reabrir.'
          : 'Ele ainda não começou: quem já entrou deixa de ver o desafio.',
      confirmLabel: acao === 'end' ? 'Encerrar' : 'Apagar',
      destructive: true,
      onConfirm: () => (acao === 'end' ? fim.mutate(c.id) : remover.mutate(c.id)),
    });

  return (
    <>
      <Text className="text-xs text-muted-foreground">
        Os membros escolhem se participam. O ranking aparece só para quem entrou; os de nutrição
        contam dias na meta de cada pessoa, nunca quanto ela comeu.
      </Text>
      {criando && lista.data ? (
        <NovoDesafio g={g} hoje={lista.data.today} onDone={() => setCriando(false)} />
      ) : (
        <Button onPress={() => setCriando(true)}>Novo desafio</Button>
      )}
      {desafios.length === 0 && !criando ? (
        <EmptyState
          title="Nenhum desafio ainda"
          description="Marque um desafio de dias ativos, treinos, passos, água ou metas de nutrição."
        />
      ) : null}
      {desafios.map((c) => (
        <PanelCard key={c.id}>
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-sm font-semibold text-foreground">{c.title}</Text>
            <ChallengeStatusBadge challenge={c} />
          </View>
          <Text className="text-xs text-muted-foreground">
            {`${METRIC_INFO[c.metric].label} · ${challengePeriod(c)} · ${participantsLabel(c.participants)}`}
          </Text>
          {c.canManage && c.status === 'running' ? (
            <Button variant="outline" onPress={() => confirmar(c, 'end')}>
              Encerrar agora
            </Button>
          ) : null}
          {c.canManage && c.status === 'upcoming' ? (
            <Button variant="outline" onPress={() => confirmar(c, 'remove')}>
              Apagar
            </Button>
          ) : null}
        </PanelCard>
      ))}
    </>
  );
}

/** Equivalente de `apps/web/src/app/(org)/org/[groupId]/challenges/page.tsx`. */
export default function OrgChallengesScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <OrgPanel groupId={groupId}>{(g) => <Desafios g={g} />}</OrgPanel>;
}
