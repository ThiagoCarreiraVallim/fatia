import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ANNOUNCEMENT_TITLE_MAX,
  announcementSlots,
  announcementsApi,
  feedApi,
  moderationApi,
  PIN_DAY_OPTIONS,
  POLL_MAX_OPTIONS,
  POLL_MIN_VOTES,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  POST_BODY_MAX,
  pollClosesLabel,
  pollProblem,
  repeatOptions,
  type Announcement,
  type AnnouncementRepeat,
  type MyGroup,
} from '@fatia/api-client';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { apiMessage, Choice, OrgPanel, PanelCard } from '@/components/org/org-panel';
import {
  Button,
  Chip,
  EmptyState,
  Input,
  LoadingState,
  Segmented,
  Switch,
  useConfirm,
} from '@/components/ui';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';

const chave = (groupId: string) => ['community', 'org', groupId, 'announcements'] as const;
const DIAS_A_FRENTE = 14;
const POLL_DAYS = [
  { value: '1', label: '1 dia' },
  { value: '3', label: '3 dias' },
  { value: '7', label: '1 semana' },
];
const REPEAT_TEXT: Record<AnnouncementRepeat, string> = {
  NONE: '',
  DAILY: 'todo dia',
  WEEKLY: 'toda semana',
  MONTHLY: 'todo mês',
};

function scheduledLine(a: Announcement): string {
  const q = a.nextRunAt ? new Date(a.nextRunAt) : null;
  const hora = q
    ? `${q.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${q.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : '';
  return [
    REPEAT_TEXT[a.repeat],
    hora,
    a.push ? 'notificação' : 'só no mural',
    a.pin ? 'fixado' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        <Text className="text-xs text-muted-foreground">{hint}</Text>
      </View>
      <Switch checked={checked} onCheckedChange={onChange} label={label} />
    </View>
  );
}

function NovoComunicado({ g, onDone }: { g: MyGroup; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [comoGrupo, setComoGrupo] = useState<'group' | 'me'>('group');
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [vista, setVista] = useState<'write' | 'preview'>('write');
  const [fixar, setFixar] = useState(true);
  const [prazo, setPrazo] = useState('7');
  const [push, setPush] = useState(true);
  const [quando, setQuando] = useState<'now' | 'later'>('now');
  const [diaIdx, setDiaIdx] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [repetir, setRepetir] = useState<AnnouncementRepeat>('NONE');

  const dias = useMemo(() => {
    const hoje = new Date();
    return Array.from(
      { length: DIAS_A_FRENTE },
      (_, i) => new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i),
    );
  }, []);
  const slots = useMemo(() => announcementSlots(dias[diaIdx]!), [dias, diaIdx]);

  const enviar = useMutation({
    mutationFn: () =>
      announcementsApi.create(g.id, {
        title: titulo.trim(),
        body: texto.trim(),
        publishedAs: comoGrupo === 'group' ? 'GROUP' : 'PERSON',
        pin: fixar,
        pinDays: fixar ? (prazo === 'none' ? null : Number(prazo)) : null,
        push,
        at: quando === 'later' ? slot : null,
        repeat: quando === 'later' ? repetir : 'NONE',
      }),
    onSuccess: () => {
      toast.show({
        message: quando === 'later' ? 'Comunicado agendado.' : 'Comunicado publicado no mural.',
      });
      void qc.invalidateQueries({ queryKey: chave(g.id) });
      void qc.invalidateQueries({ queryKey: ['community', 'feed', g.id] });
      onDone();
    },
    onError: (err) =>
      toast.show({ message: apiMessage(err, 'Não deu para mandar o comunicado agora.') }),
  });
  const pronto = titulo.trim() && texto.trim() && (quando === 'now' || slot);

  return (
    <PanelCard title="Novo comunicado">
      <Segmented
        label="Publicar como"
        value={comoGrupo}
        options={[
          { value: 'group', label: g.name },
          { value: 'me', label: 'Eu' },
        ]}
        onChange={setComoGrupo}
      />
      <Input
        value={titulo}
        onChangeText={setTitulo}
        maxLength={ANNOUNCEMENT_TITLE_MAX}
        accessibilityLabel="Título"
        placeholder="Título"
      />
      <Segmented
        label="Modo do texto"
        value={vista}
        options={[
          { value: 'write', label: 'Escrever' },
          { value: 'preview', label: 'Prévia' },
        ]}
        onChange={setVista}
      />
      {vista === 'write' ? (
        <Input
          value={texto}
          onChangeText={setTexto}
          maxLength={POST_BODY_MAX}
          multiline
          className="min-h-[96px]"
          textAlignVertical="top"
          accessibilityLabel="Texto"
          placeholder="Texto. Aceita **negrito**, _itálico_, # título, - lista e > citação."
        />
      ) : (
        <View className="gap-1 rounded-xl border border-dashed border-border p-3">
          <Text className="text-[11px] font-bold uppercase text-primary">
            {fixar ? 'Aviso da equipe · fixado' : 'Aviso da equipe'}
          </Text>
          <Text className="font-semibold text-foreground">{titulo || 'Título'}</Text>
          {texto.trim() ? (
            <MarkdownLite source={texto} />
          ) : (
            <Text className="text-sm text-muted-foreground">Nada para mostrar ainda.</Text>
          )}
        </View>
      )}
      <Text className="text-xs text-muted-foreground">
        Sem peso, medidas ou dados de saúde de membros. O mural é para toda a comunidade.
      </Text>
      <Toggle
        label="Fixar no topo do mural"
        hint={
          fixar
            ? 'Entra no carrossel de avisos, com até 3 fixados'
            : 'Entra no mural como post comum'
        }
        checked={fixar}
        onChange={setFixar}
      />
      {fixar ? (
        <Segmented
          label="Fica no topo por"
          value={prazo}
          options={PIN_DAY_OPTIONS.map((o) => ({
            value: o.days ? String(o.days) : 'none',
            label: o.label,
          }))}
          onChange={setPrazo}
        />
      ) : null}
      <Toggle
        label="Avisar por notificação"
        hint={
          push
            ? 'Vai para quem deixou “Comunicados da comunidade” ligado'
            : 'Ninguém recebe notificação'
        }
        checked={push}
        onChange={setPush}
      />
      <Segmented
        label="Quando"
        value={quando}
        options={[
          { value: 'now', label: 'Agora' },
          { value: 'later', label: 'Agendar' },
        ]}
        onChange={setQuando}
      />
      {quando === 'later' ? (
        <View className="gap-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityLabel="Dia"
            contentContainerClassName="gap-2"
          >
            {dias.map((d, i) => (
              <Chip
                key={d.toISOString()}
                label={d.toLocaleDateString('pt-BR', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
                selected={diaIdx === i}
                onPress={() => {
                  setDiaIdx(i);
                  setSlot(null);
                }}
              />
            ))}
          </ScrollView>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityLabel="Horário"
            contentContainerClassName="gap-2"
          >
            {slots.map((s) => (
              <Chip
                key={s.iso}
                label={s.label}
                selected={slot === s.iso}
                onPress={() => setSlot(s.iso)}
              />
            ))}
          </ScrollView>
          <Text className="text-xs text-muted-foreground">Horário em blocos de 15 minutos.</Text>
          <Choice
            label="Repetir"
            options={repeatOptions(slot ? new Date(slot) : dias[diaIdx]!)}
            value={repetir}
            onChange={setRepetir}
          />
        </View>
      ) : null}
      <View className="flex-row gap-2">
        <Button variant="ghost" className="flex-1" onPress={onDone}>
          Cancelar
        </Button>
        <Button
          className="flex-1"
          disabled={!pronto}
          loading={enviar.isPending}
          onPress={() => enviar.mutate()}
        >
          {quando === 'later'
            ? repetir !== 'NONE'
              ? 'Agendar e repetir'
              : 'Agendar'
            : 'Publicar agora'}
        </Button>
      </View>
    </PanelCard>
  );
}

function NovaEnquete({ g, onDone }: { g: MyGroup; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [pergunta, setPergunta] = useState('');
  const [opcoes, setOpcoes] = useState(['', '']);
  const [dias, setDias] = useState('3');
  const publicar = useMutation({
    mutationFn: () =>
      feedApi.create(g.id, {
        kind: 'POLL',
        publishedAs: 'GROUP',
        poll: {
          question: pergunta.trim(),
          options: opcoes.map((o) => o.trim()).filter(Boolean),
          days: Number(dias),
        },
      }),
    onSuccess: () => {
      toast.show({ message: 'Enquete publicada no mural.' });
      void qc.invalidateQueries({ queryKey: chave(g.id) });
      void qc.invalidateQueries({ queryKey: ['community', 'feed', g.id] });
      onDone();
    },
    onError: (err) =>
      toast.show({ message: apiMessage(err, 'Não deu para publicar a enquete agora.') }),
  });
  return (
    <PanelCard title="Nova enquete">
      <Input
        value={pergunta}
        onChangeText={setPergunta}
        maxLength={POLL_QUESTION_MAX}
        accessibilityLabel="Pergunta"
        placeholder="Pergunta"
      />
      <Text className="text-xs font-semibold text-muted-foreground">
        {`Opções · de 2 a ${POLL_MAX_OPTIONS}`}
      </Text>
      {opcoes.map((o, i) => (
        <Input
          key={i}
          value={o}
          onChangeText={(v) => setOpcoes(opcoes.map((x, j) => (j === i ? v : x)))}
          maxLength={POLL_OPTION_MAX}
          accessibilityLabel={`Opção ${i + 1}`}
          placeholder="Opção"
        />
      ))}
      {opcoes.length < POLL_MAX_OPTIONS ? (
        <Button size="sm" variant="ghost" onPress={() => setOpcoes([...opcoes, ''])}>
          Adicionar opção
        </Button>
      ) : null}
      <Segmented label="Prazo" value={dias} options={POLL_DAYS} onChange={setDias} />
      <Text className="text-xs text-muted-foreground">
        {`Em %, sem nomes. Com menos de ${POLL_MIN_VOTES} votos o resultado fica oculto para todos, inclusive a equipe. O aluno pode mudar o voto até o prazo.`}
      </Text>
      <View className="flex-row gap-2">
        <Button variant="ghost" className="flex-1" onPress={onDone}>
          Cancelar
        </Button>
        <Button
          className="flex-1"
          disabled={Boolean(pollProblem(pergunta, opcoes))}
          loading={publicar.isPending}
          onPress={() => publicar.mutate()}
        >
          Publicar no mural
        </Button>
      </View>
    </PanelCard>
  );
}

function Comunicados({ g }: { g: MyGroup }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [aberto, setAberto] = useState<'announcement' | 'poll' | null>(null);
  const agendados = useQuery({
    queryKey: [...chave(g.id), 'scheduled'],
    queryFn: () => announcementsApi.list(g.id),
  });
  const enquetes = useQuery({
    queryKey: [...chave(g.id), 'polls'],
    queryFn: () => moderationApi.polls(g.id),
  });
  const cancela = useMutation({
    mutationFn: (id: string) => announcementsApi.cancel(g.id, id),
    onSuccess: () => {
      toast.show({ message: 'Comunicado cancelado. Nada mais sai dele.' });
      void qc.invalidateQueries({ queryKey: chave(g.id) });
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para cancelar agora.') }),
  });

  if (agendados.isPending) return <LoadingState />;

  return (
    <>
      {aberto === null ? (
        <View className="flex-row gap-2">
          <Button className="flex-1" onPress={() => setAberto('announcement')}>
            Novo comunicado
          </Button>
          <Button className="flex-1" variant="outline" onPress={() => setAberto('poll')}>
            Nova enquete
          </Button>
        </View>
      ) : null}
      {aberto === 'announcement' ? <NovoComunicado g={g} onDone={() => setAberto(null)} /> : null}
      {aberto === 'poll' ? <NovaEnquete g={g} onDone={() => setAberto(null)} /> : null}

      <PanelCard title="Agendados">
        {(agendados.data ?? []).length === 0 ? (
          <Text className="text-xs text-muted-foreground">Nada agendado.</Text>
        ) : (
          (agendados.data ?? []).map((a) => (
            <View key={a.id} className="flex-row items-center justify-between gap-2">
              <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                  {a.title}
                </Text>
                <Text className="text-xs text-muted-foreground">{scheduledLine(a)}</Text>
              </View>
              <Button
                size="sm"
                variant="outline"
                onPress={() =>
                  confirm({
                    title: `Cancelar “${a.title}”?`,
                    description:
                      'O que já saiu continua no mural. Os próximos disparos não acontecem.',
                    confirmLabel: 'Cancelar comunicado',
                    destructive: true,
                    onConfirm: () => cancela.mutate(a.id),
                  })
                }
              >
                Cancelar
              </Button>
            </View>
          ))
        )}
      </PanelCard>

      <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
        Enquetes
      </Text>
      <Text className="text-xs text-muted-foreground">
        Pergunte à comunidade. O resultado sai em %, sem nomes.
      </Text>
      {(enquetes.data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhuma enquete ainda"
          description="A enquete vira um cartão de voto no mural."
        />
      ) : (
        (enquetes.data ?? []).map((p) => (
          <PanelCard key={p.postId}>
            <Text className="font-semibold text-foreground">{p.question}</Text>
            <Text className="text-xs text-muted-foreground">
              {`por ${p.author} · ${p.options.length} opções · ${pollClosesLabel(p)}`}
            </Text>
            {p.totalVotes === null ? (
              <Text className="text-xs text-muted-foreground">
                {`Resultado oculto · aparece com ${POLL_MIN_VOTES} votos ou mais.`}
              </Text>
            ) : (
              <View className="gap-1">
                {p.options.map((o) => (
                  <View key={o.label} className="flex-row justify-between gap-2">
                    <Text className="text-sm text-foreground">{o.label}</Text>
                    <Text className="text-sm text-muted-foreground">{`${o.percent}%`}</Text>
                  </View>
                ))}
                <Text className="text-xs text-muted-foreground">
                  {`${p.totalVotes} votos · sem nomes. Ninguém vê em quem cada pessoa votou.`}
                </Text>
              </View>
            )}
          </PanelCard>
        ))
      )}
    </>
  );
}

/** Equivalente de `apps/web/src/app/(org)/org/[groupId]/announcements/page.tsx` (Pn-14 e Pn-26). */
export default function OrgAnnouncementsScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <OrgPanel groupId={groupId}>{(g) => <Comunicados g={g} />}</OrgPanel>;
}
