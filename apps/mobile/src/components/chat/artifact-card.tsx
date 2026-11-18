import { useState, type ComponentType } from 'react';
import { Linking, Pressable, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  Download,
  FileText,
  Gauge,
  List,
  Lock,
  Medal,
  Search,
  SlidersHorizontal,
  Table,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react-native';
import {
  UNKNOWN_CHAT_ARTIFACT_TEXT,
  appOnlyHref,
  cardEyebrow,
  chatCardTitle,
  getChatToolCatalog,
  getAutoWriteStatus,
  SAVED_CARD_COPY,
  savedStateFromStatus,
  savedUndoId,
  undoAutoWrite,
  undoFailureState,
  type SavedCardState,
  isRenderableChatArtifact,
  timelineAxisLabels,
  timelinePeriodLabel,
  type ChatArtifact,
} from '@fatia/api-client';
import { Text } from '@/components/ui/text';
import {
  chartColors,
  extent,
  formatDecimal,
  formatInteger,
  linearScale,
  monotonePath,
} from '@/components/charts';
import { Button, cn } from '@/components/ui';
import { colors } from '@/theme/colors';

/**
 * O cartão de uma tool (evento `artifact`), um por formato da prancha IA-Cartoes (#384), com o
 * cabeçalho igual em todos: o ícone, o nome da ferramenta pequeno em cima e o resultado como
 * título (`chatCardTitle`, o mesmo do PWA). Gráfico com o kit do app (ADR 012).
 */

const MAX_LINHAS = 20;
// "1.700", com o ponto do milhar, como na prancha IA-Cartoes.
const numero = (v: number) => (Number.isInteger(v) ? formatInteger(v) : formatDecimal(v, 1));
const comUnidade = (v: number, unidade?: string) => `${numero(v)}${unidade ? ` ${unidade}` : ''}`;
const CAIXA = 'rounded-xl bg-secondary px-3';

type De<K extends ChatArtifact['kind']> = { artifact: Extract<ChatArtifact, { kind: K }> };

const ICONES: Record<ChatArtifact['kind'], ComponentType<{ size?: number; color?: string }>> = {
  metric: Gauge,
  bars: BarChart3,
  timeline: TrendingUp,
  list: List,
  report: Table,
  range: SlidersHorizontal,
  progress: Target,
  comparison: ArrowLeftRight,
  scoreboard: Trophy,
  badges: Medal,
  instructions: BookOpen,
  file: Download,
  sources: Search,
  app_only: Lock,
  saved: Check,
};

/** O catálogo das tools: de onde sai o link do "só no app". */
export function useChatToolCatalog() {
  return useQuery({
    queryKey: ['chat', 'tool-catalog'],
    queryFn: getChatToolCatalog,
    staleTime: 60 * 60_000,
  }).data;
}

/**
 * Um formato que este app não sabe desenhar (API mais nova, carga sem o campo principal) vira
 * um aviso neutro: app antigo não derruba a conversa.
 */
export function ArtifactCard({ artifact, tool }: { artifact: ChatArtifact; tool?: string }) {
  if (!isRenderableChatArtifact(artifact)) {
    return (
      <View
        accessibilityLabel={tool ?? 'Cartão'}
        className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3.5"
      >
        <View className="size-9 items-center justify-center rounded-xl bg-secondary">
          <Lock size={18} color={colors.mutedForeground} />
        </View>
        <View className="flex-1">
          {tool ? (
            <Text numberOfLines={1} className="text-xs text-muted-foreground">
              {tool}
            </Text>
          ) : null}
          <Text className="text-sm text-muted-foreground">{UNKNOWN_CHAT_ARTIFACT_TEXT}</Text>
        </View>
      </View>
    );
  }
  const Icone = ICONES[artifact.kind];
  const titulo = chatCardTitle(artifact);
  const acima = cardEyebrow(artifact.kind, tool);
  const video = artifact.kind === 'instructions' ? artifact.videoUrl : undefined;
  return (
    <View
      accessibilityLabel={titulo}
      className="gap-3 rounded-2xl border border-border bg-card p-3.5"
    >
      <View className="flex-row items-center gap-3">
        <View
          className={cn(
            'size-9 items-center justify-center rounded-xl',
            artifact.kind === 'app_only' ? 'bg-secondary' : 'bg-primary/15',
          )}
        >
          <Icone
            size={18}
            color={artifact.kind === 'app_only' ? colors.mutedForeground : colors.primaryText}
          />
        </View>
        <View className="flex-1">
          {acima ? (
            <Text numberOfLines={1} className="text-xs text-muted-foreground">
              {acima}
            </Text>
          ) : null}
          <Text className="text-[15px] font-bold text-foreground">{titulo}</Text>
        </View>
        {video ? (
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(video)}>
            <Text className="text-xs font-semibold text-primary-text">Ver vídeo</Text>
          </Pressable>
        ) : null}
      </View>
      <CardContent artifact={artifact} />
    </View>
  );
}

const Vazio = ({ texto }: { texto: string }) => (
  <Text className="text-sm text-muted-foreground">{texto}</Text>
);

function CardContent({ artifact }: { artifact: ChatArtifact }) {
  switch (artifact.kind) {
    case 'metric':
      return <Metrica artifact={artifact} />;
    case 'bars':
      return <Barras artifact={artifact} />;
    case 'timeline':
      return <LinhaDoTempo artifact={artifact} />;
    case 'list':
      return <ListaRica artifact={artifact} />;
    case 'report':
      return <Tabela artifact={artifact} />;
    case 'range':
      return <Faixa artifact={artifact} />;
    case 'progress':
      return <Progresso artifact={artifact} />;
    case 'comparison':
      return <Comparacao artifact={artifact} />;
    case 'scoreboard':
      return <Placar artifact={artifact} />;
    case 'badges':
      return <Selos artifact={artifact} />;
    case 'instructions':
      return <Instrucoes artifact={artifact} />;
    case 'file':
      return <Arquivo artifact={artifact} />;
    case 'sources':
      return <Fontes artifact={artifact} />;
    case 'app_only':
      return <SoNoApp artifact={artifact} />;
    case 'saved':
      return <GravadoComDesfazer artifact={artifact} />;
  }
}

function Metrica({ artifact }: De<'metric'>) {
  const alvo = artifact.target;
  const teto = alvo?.max ?? alvo?.min;
  return (
    <View className="gap-2">
      <View className="flex-row items-baseline gap-1.5">
        <Text className="text-3xl font-extrabold text-foreground">{numero(artifact.value)}</Text>
        {artifact.unit ? (
          <Text className="text-sm text-muted-foreground">{artifact.unit}</Text>
        ) : null}
        {alvo && (alvo.min != null || alvo.max != null) ? (
          <Text className="ml-auto text-xs text-muted-foreground">
            meta{' '}
            {alvo.min != null && alvo.max != null
              ? `${numero(alvo.min)}–${numero(alvo.max)}`
              : alvo.min != null
                ? `a partir de ${numero(alvo.min)}`
                : `até ${numero(alvo.max as number)}`}
          </Text>
        ) : null}
      </View>
      {teto ? (
        <View className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(1, artifact.value / teto) * 100}%` }}
          />
        </View>
      ) : null}
      {artifact.breakdown?.length ? (
        <View className="flex-row flex-wrap gap-x-4 gap-y-1">
          {artifact.breakdown.map((item) => (
            <Text key={item.label} className="text-xs text-muted-foreground">
              {item.label}{' '}
              <Text className="text-xs font-semibold text-foreground">
                {comUnidade(item.value, item.unit ?? artifact.unit)}
              </Text>
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Uma barra por dia; a meta é a linha tracejada e o verde marca quem bateu. */
function Barras({ artifact }: De<'bars'>) {
  if (artifact.bars.length === 0) return <Vazio texto="Sem registros no período." />;
  const maior = Math.max(artifact.goal ?? 0, ...artifact.bars.map((b) => b.value), 1);
  return (
    <View className="gap-2">
      <View className="h-24 flex-row items-end gap-1.5">
        {artifact.goal ? (
          <View
            className="absolute inset-x-0 border-t border-dashed border-border-strong"
            style={{ bottom: `${(artifact.goal / maior) * 100}%` }}
          />
        ) : null}
        {artifact.bars.map((barra, i) => (
          <View
            key={`${barra.label}-${i}`}
            accessibilityLabel={`${barra.label}: ${comUnidade(barra.value, artifact.unit)}`}
            className={cn('flex-1 rounded-md', barra.reached ? 'bg-primary' : 'bg-secondary')}
            style={{ height: `${Math.max(4, (barra.value / maior) * 100)}%` }}
          />
        ))}
      </View>
      <View className="flex-row gap-1.5">
        {artifact.bars.map((barra, i) => (
          <Text
            key={`${barra.label}-${i}`}
            numberOfLines={1}
            className="flex-1 text-center text-[11px] text-muted-foreground"
          >
            {barra.label}
          </Text>
        ))}
      </View>
      {artifact.goal ? (
        <Text className="text-xs text-muted-foreground">
          Linha tracejada: meta de {comUnidade(artifact.goal, artifact.unit)} · verde bateu
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A linha da evolução sem eixos (prancha IA-Cartoes, "Linha do tempo"): o traço, o último ponto
 * marcado e três datas embaixo. O valor de cada ponto vai para o leitor de tela.
 */
function LinhaDoTempo({ artifact }: De<'timeline'>) {
  const [largura, setLargura] = useState(0);
  if (artifact.events.length === 0) return <Vazio texto="Sem registros no período." />;
  const valores = artifact.events.map((e) => e.value);
  const datas = timelineAxisLabels(artifact.events);
  const altura = 110;
  const [min, max] = extent(valores) ?? [0, 1];
  const folga = max === min ? 1 : (max - min) * 0.12;
  const y = linearScale([min - folga, max + folga], [altura - 6, 6]);
  const pontos = valores.map((v, i) => ({
    x: valores.length === 1 ? largura / 2 : 6 + (i * (largura - 12)) / (valores.length - 1),
    y: y(v),
  }));
  const ultimo = pontos.at(-1);
  return (
    <View className="gap-2">
      {artifact.delta != null ? (
        <View className="self-start rounded-full bg-primary/15 px-2 py-0.5">
          <Text className="text-xs font-bold text-primary-text">
            {artifact.delta > 0 ? '+' : ''}
            {comUnidade(artifact.delta, artifact.unit)} {timelinePeriodLabel(artifact.events)}
          </Text>
        </View>
      ) : null}
      {artifact.events.length > 1 ? (
        <View
          accessibilityRole="image"
          accessibilityLabel={`${artifact.label ?? 'Evolução'}: ${artifact.events
            .map((e) => `${e.date.slice(0, 10)} ${comUnidade(e.value, artifact.unit)}`)
            .join(', ')}`}
          onLayout={(e: LayoutChangeEvent) => setLargura(Math.round(e.nativeEvent.layout.width))}
          style={{ height: altura }}
        >
          {largura > 0 ? (
            <Svg width={largura} height={altura}>
              <Path
                d={monotonePath(pontos)}
                stroke={chartColors.primary}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              {ultimo ? (
                <Circle cx={ultimo.x} cy={ultimo.y} r={4.5} fill={chartColors.primary} />
              ) : null}
            </Svg>
          ) : null}
        </View>
      ) : null}
      {datas.length > 1 ? (
        <View className="flex-row justify-between">
          {datas.map((d, i) => (
            <Text key={`${d}-${i}`} className="text-[11px] text-muted-foreground">
              {d}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ListaRica({ artifact }: De<'list'>) {
  if (artifact.items.length === 0) return <Vazio texto="Nada encontrado." />;
  const visiveis = artifact.items.slice(0, MAX_LINHAS);
  return (
    <View className={CAIXA}>
      {visiveis.map((item, i) => (
        <View
          key={`${item.title}-${i}`}
          className={cn('flex-row items-center gap-3 py-2', i > 0 && 'border-t border-border')}
        >
          <View className="flex-1">
            <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
              {item.title}
            </Text>
            {item.detail ? (
              <Text numberOfLines={1} className="text-xs text-muted-foreground">
                {item.detail}
              </Text>
            ) : null}
          </View>
          {item.value != null ? (
            <Text className="text-sm font-semibold text-foreground">
              {typeof item.value === 'number' ? numero(item.value) : item.value}
              {item.unit ? ` ${item.unit}` : ''}
            </Text>
          ) : null}
        </View>
      ))}
      {artifact.items.length > visiveis.length ? (
        <Text className="pb-2 text-xs text-muted-foreground">
          e mais {artifact.items.length - visiveis.length}
        </Text>
      ) : null}
      {artifact.total ? (
        <Text className="border-t border-border py-2 text-right text-sm font-bold text-foreground">
          {artifact.total}
        </Text>
      ) : null}
    </View>
  );
}

function Tabela({ artifact }: De<'report'>) {
  if (artifact.rows.length === 0) return <Vazio texto="Nada no período." />;
  const linhas = artifact.rows.slice(0, MAX_LINHAS);
  return (
    <View className="rounded-xl bg-secondary py-1">
      <ScrollView horizontal>
        <View>
          {[artifact.columns, ...linhas].map((linha, r) => (
            <View key={r} className={cn('flex-row', r > 0 && 'border-t border-border')}>
              {linha.map((celula, c) => (
                <Text
                  key={c}
                  className={cn(
                    'w-28 px-2 py-1.5 text-[13px]',
                    r === 0 ? 'text-xs text-muted-foreground' : 'text-foreground',
                  )}
                >
                  {celula == null || celula === ''
                    ? '—'
                    : typeof celula === 'number'
                      ? numero(celula)
                      : celula}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      {artifact.rows.length > linhas.length ? (
        <Text className="px-2 pt-1 text-xs text-muted-foreground">
          e mais {artifact.rows.length - linhas.length}
        </Text>
      ) : null}
    </View>
  );
}

function Faixa({ artifact }: De<'range'>) {
  if (artifact.rows.length === 0) return <Vazio texto="Nenhuma faixa definida." />;
  return (
    <View className={cn(CAIXA, 'gap-3 py-3')}>
      {artifact.rows.map((linha) => {
        const teto = Math.max(linha.max ?? 0, linha.min ?? 0, linha.value, 1) * 1.15;
        const pos = (v: number) => Math.min(100, (v / teto) * 100);
        const ini = pos(linha.min ?? 0);
        const fim = pos(linha.max ?? teto);
        return (
          <View key={linha.label} className="gap-1.5">
            <View className="flex-row items-baseline justify-between gap-2">
              <Text className="text-sm text-foreground">{linha.label}</Text>
              <Text className="text-xs text-muted-foreground">
                <Text className="text-xs font-bold text-foreground">{numero(linha.value)}</Text>
                {linha.min != null && linha.max != null
                  ? ` / ${numero(linha.min)}–${numero(linha.max)}`
                  : linha.min != null
                    ? ` / a partir de ${numero(linha.min)}`
                    : linha.max != null
                      ? ` / até ${numero(linha.max)}`
                      : ''}
                {linha.unit ? ` ${linha.unit}` : ''}
              </Text>
            </View>
            <View className="h-1.5 rounded-full bg-background">
              {linha.min != null || linha.max != null ? (
                <View
                  className="absolute inset-y-0 rounded-full bg-border-strong"
                  style={{ left: `${ini}%`, width: `${Math.max(0, fim - ini)}%` }}
                />
              ) : null}
              <View
                className="absolute -top-1 h-3.5 w-1 rounded-full bg-primary"
                style={{ left: `${pos(linha.value)}%` }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Progresso({ artifact }: De<'progress'>) {
  if (artifact.items.length === 0) return <Vazio texto="Nenhuma meta ainda." />;
  return (
    <View className={CAIXA}>
      {artifact.items.map((item, i) => {
        const ok = /ativ|conclu|bateu/i.test(item.status ?? '');
        return (
          <View
            key={`${item.title}-${i}`}
            className={cn('flex-row items-center gap-3 py-2.5', i > 0 && 'border-t border-border')}
          >
            <View className="size-10 items-center justify-center rounded-full border-4 border-primary">
              <Text className="text-[10px] font-bold text-foreground">
                {Math.round(item.percent)}%
              </Text>
            </View>
            <View className="flex-1">
              <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
                {item.title}
              </Text>
              {item.detail ? (
                <Text numberOfLines={1} className="text-xs text-muted-foreground">
                  {item.detail}
                </Text>
              ) : null}
            </View>
            {item.status ? (
              <View
                className={cn('rounded-full px-2 py-0.5', ok ? 'bg-primary/15' : 'bg-warning/15')}
              >
                <Text
                  className={cn(
                    'text-[10px] font-bold uppercase',
                    ok ? 'text-primary-text' : 'text-warning',
                  )}
                >
                  {item.status}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const valorDaComparacao = (v: number | string | undefined, unidade?: string) =>
  v == null ? '—' : `${typeof v === 'number' ? numero(v) : v}${unidade ? ` ${unidade}` : ''}`;

function Comparacao({ artifact }: De<'comparison'>) {
  const comAntes = artifact.items.some((item) => item.before != null);
  return (
    <View className={CAIXA}>
      {comAntes ? (
        <View className="flex-row pt-2">
          <View className="flex-1" />
          <Text className="w-20 text-xs text-muted-foreground">Antes</Text>
          <Text className="w-20 text-right text-xs text-primary-text">Agora</Text>
        </View>
      ) : null}
      {artifact.items.map((item, i) => (
        <View
          key={item.label}
          className={cn('flex-row items-center py-2', i > 0 && 'border-t border-border')}
        >
          <Text className="flex-1 text-sm text-muted-foreground">{item.label}</Text>
          {comAntes ? (
            <Text className="w-20 text-sm text-muted-foreground">
              {valorDaComparacao(item.before, item.unit)}
            </Text>
          ) : null}
          <Text className="w-20 text-right text-sm font-bold text-foreground">
            {valorDaComparacao(item.value, item.unit)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

function Placar({ artifact }: De<'scoreboard'>) {
  if (artifact.entries.length === 0) return <Vazio texto="Ninguém pontuou ainda." />;
  return (
    <View className="overflow-hidden rounded-xl bg-secondary">
      {artifact.entries.map((linha) => (
        <View
          key={`${linha.position}-${linha.name}`}
          className={cn('flex-row items-center gap-3 px-3 py-2.5', linha.you && 'bg-primary/15')}
        >
          <Text className="w-4 text-sm text-muted-foreground">{linha.position}</Text>
          <View className="size-7 items-center justify-center rounded-full bg-background">
            <Text className="text-[10px] font-bold text-foreground">{iniciais(linha.name)}</Text>
          </View>
          <Text
            numberOfLines={1}
            className={cn('flex-1 text-sm text-foreground', linha.you && 'font-bold')}
          >
            {linha.name}
          </Text>
          <Text className="text-sm font-semibold text-foreground">
            {comUnidade(linha.value, linha.unit)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Selos({ artifact }: De<'badges'>) {
  if (artifact.badges.length === 0) return <Vazio texto="Nenhuma conquista ainda." />;
  return (
    <View className="flex-row flex-wrap gap-y-3">
      {artifact.badges.map((selo, i) => (
        <View
          key={`${selo.title}-${i}`}
          accessibilityLabel={`${selo.title}${selo.unlocked ? '' : ', bloqueada'}`}
          className="w-1/4 items-center gap-1"
        >
          <View
            className={cn(
              'size-11 items-center justify-center rounded-full',
              selo.unlocked ? 'bg-primary/15' : 'bg-secondary',
            )}
          >
            {selo.unlocked ? (
              <Medal size={20} color={colors.primaryText} />
            ) : (
              <Lock size={18} color={colors.faintForeground} />
            )}
          </View>
          <Text
            numberOfLines={2}
            className={cn(
              'text-center text-[11px]',
              selo.unlocked ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {selo.title}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Instrucoes({ artifact }: De<'instructions'>) {
  return (
    <View className="gap-3">
      {artifact.steps.map((passo, i) => (
        <View key={i} className="flex-row gap-3">
          <View className="size-6 items-center justify-center rounded-full bg-secondary">
            <Text className="text-xs font-bold text-foreground">{i + 1}</Text>
          </View>
          <Text className="flex-1 pt-0.5 text-sm text-foreground">{passo}</Text>
        </View>
      ))}
    </View>
  );
}

function Arquivo({ artifact }: De<'file'>) {
  const expira = new Date(artifact.expiresAt);
  return (
    <View className="gap-2.5">
      <View className={cn(CAIXA, 'flex-row items-center gap-3 py-2.5')}>
        <FileText size={20} color={colors.mutedForeground} />
        <Text numberOfLines={1} className="flex-1 text-sm font-semibold text-foreground">
          {artifact.filename}
        </Text>
      </View>
      <Button onPress={() => void Linking.openURL(artifact.url)}>Baixar</Button>
      {Number.isNaN(expira.getTime()) ? null : (
        <Text className="text-xs text-muted-foreground">
          O link vale até{' '}
          {expira.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
          .
        </Text>
      )}
    </View>
  );
}

function Fontes({ artifact }: De<'sources'>) {
  if (artifact.sources.length === 0) return <Vazio texto="A busca não trouxe nada." />;
  return (
    <View className={CAIXA}>
      {artifact.sources.map((fonte, i) => (
        <Pressable
          key={fonte.url}
          accessibilityRole="link"
          accessibilityLabel={`${fonte.title || fonte.domain}, ${fonte.domain}`}
          onPress={() => void Linking.openURL(fonte.url)}
          className={cn('flex-row items-center gap-3 py-2.5', i > 0 && 'border-t border-border')}
        >
          <Text className="w-3 text-xs text-muted-foreground">{i + 1}</Text>
          <View className="flex-1">
            <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
              {fonte.title || fonte.domain}
            </Text>
            <Text numberOfLines={1} className="text-xs text-muted-foreground">
              {fonte.domain}
            </Text>
          </View>
          <ArrowUpRight size={16} color={colors.mutedForeground} />
        </Pressable>
      ))}
    </View>
  );
}

function SoNoApp({ artifact }: De<'app_only'>) {
  const router = useRouter();
  const entrada = useChatToolCatalog()?.[artifact.tool];
  const link = appOnlyHref(entrada, artifact.params);
  return (
    <View className="gap-2.5">
      <Text className="text-sm text-muted-foreground">
        Isso não tem volta ou mexe no acesso de alguém, então é feito na tela, onde dá para conferir
        antes.
      </Text>
      {link && entrada?.appOnly ? (
        <Button
          accessibilityRole="link"
          // As rotas do catálogo são as de `ROUTES`, iguais no app e no PWA.
          onPress={() => router.push(link as never)}
        >
          {`Abrir ${entrada.appOnly.screen}`}
        </Button>
      ) : null}
    </View>
  );
}

/** O Desfazer de verdade (ADR 039): pela API, e depois relê tudo — o registro sai das telas. */
function GravadoComDesfazer({ artifact }: De<'saved'>) {
  const queryClient = useQueryClient();
  const id = savedUndoId(artifact);
  // O estado guardado no servidor: reabrir a conversa não oferece de novo o que já foi desfeito,
  // nem um Desfazer vencido (#385).
  const status = useQuery({
    queryKey: ['chat', 'auto-write', id],
    queryFn: () => getAutoWriteStatus(id as string),
    enabled: !!id,
    staleTime: 30_000,
  });
  return (
    <Gravado
      artifact={artifact}
      fromServer={status.data ? savedStateFromStatus(status.data.state) : undefined}
      onUndo={
        id
          ? async () => {
              await undoAutoWrite(id);
              void queryClient.invalidateQueries();
            }
          : undefined
      }
    />
  );
}

/**
 * "Gravado", com Desfazer (ADR 039): o `/mcp` emite na gravação automática. Sem `onUndo`, o
 * botão não aparece. Numa alteração, cada linha mostra antes → depois; os motivos de não desfazer
 * vêm de `undoFailureState`, iguais aos do PWA.
 */
export function Gravado({
  artifact,
  onUndo,
  fromServer,
}: De<'saved'> & { onUndo?: () => Promise<void> | void; fromServer?: SavedCardState }) {
  // O que aconteceu nesta tela vale mais que o lido do servidor; sem nada local, vale o servidor.
  const [local, setEstado] = useState<SavedCardState | null>(null);
  const estado: SavedCardState = local ?? fromServer ?? 'saved';
  const comBotao = estado === 'saved' || estado === 'undoing' || estado === 'failed';
  const aviso =
    estado === 'undone' || estado === 'expired' || estado === 'changed' || estado === 'failed'
      ? SAVED_CARD_COPY[estado]
      : null;
  return (
    <View className="gap-2.5">
      {artifact.lines.length ? (
        <View className={CAIXA}>
          {artifact.lines.map((linha, i) => (
            <View
              key={linha.label}
              className={cn(
                'flex-row items-baseline gap-2 py-2',
                i > 0 && 'border-t border-border',
              )}
            >
              <Text className="flex-1 text-sm text-muted-foreground">{linha.label}</Text>
              {linha.before ? (
                <Text className="text-sm text-muted-foreground">{`${linha.before} →`}</Text>
              ) : null}
              <Text className="text-sm font-semibold text-foreground">{linha.after}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {aviso ? <Text className="text-xs text-muted-foreground">{aviso}</Text> : null}
      {artifact.undoable && onUndo && comBotao ? (
        <Button
          variant="secondary"
          disabled={estado === 'undoing'}
          onPress={async () => {
            setEstado('undoing');
            try {
              await onUndo();
              setEstado('undone');
            } catch (erro) {
              setEstado(undoFailureState(erro));
            }
          }}
        >
          {estado === 'undoing' ? SAVED_CARD_COPY.undoing : SAVED_CARD_COPY.undo}
        </Button>
      ) : null}
    </View>
  );
}
