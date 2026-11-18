'use client';

import { useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UNKNOWN_CHAT_ARTIFACT_TEXT,
  appOnlyHref,
  barAxisLabels,
  cardEyebrow,
  chatCardTitle,
  getAutoWriteStatus,
  isRenderableChatArtifact,
  SAVED_CARD_COPY,
  savedStateFromStatus,
  savedUndoId,
  timelineAxisLabels,
  timelinePeriodLabel,
  undoAutoWrite,
  undoFailureState,
  type SavedCardState,
  type ChatArtifact,
} from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { field, ghostButton, inkButton } from '@/components/elements/surfaces';
import { useCatalogoDasTools } from './catalogo';

/**
 * O artefato de uma tool: o número, a série ou a tabela que ela devolveu, desenhado
 * direto do `structuredContent` — sem passar pela prosa do modelo, que poderia
 * transcrever "1.832 kcal" como "1.823".
 *
 * Um cartão por formato da prancha IA-Cartoes (#384), todos com o mesmo cabeçalho: o ícone,
 * o nome da ferramenta pequeno em cima e o resultado como título (`chatCardTitle`).
 */

const MAX_LINHAS = 20;
const ISO_COM_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const numero = (valor: number, casas = 0) =>
  valor.toLocaleString('pt-BR', { maximumFractionDigits: casas });

export function celula(valor: string | number | null): string {
  if (valor === null || valor === '') return '—';
  if (typeof valor === 'number') return numero(valor, 1);
  if (ISO_COM_HORA.test(valor)) {
    const data = new Date(valor);
    if (!Number.isNaN(data.getTime())) {
      return data.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }
  return valor;
}

type De<K extends ChatArtifact['kind']> = { artefato: Extract<ChatArtifact, { kind: K }> };

const vazio = (texto: string) => <p className="text-sm text-muted-foreground">{texto}</p>;
const comUnidade = (valor: number, unidade?: string) =>
  `${numero(valor, 1)}${unidade ? ` ${unidade}` : ''}`;
const linhaDoCartao = 'rounded-xl bg-foreground/[0.04] dark:bg-foreground/[0.05]';

function Metrica({ artefato }: De<'metric'>) {
  const { min, max } = artefato.target ?? {};
  const meta =
    min != null && max != null
      ? `meta ${numero(min)}–${numero(max)}`
      : min != null
        ? `meta a partir de ${numero(min)}`
        : max != null
          ? `meta até ${numero(max)}`
          : null;
  const teto = max ?? min;
  const fracao = teto ? Math.min(1, artefato.value / teto) : null;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline gap-1.5">
        <span className="text-3xl font-extrabold tabular-nums text-foreground">
          {numero(artefato.value, 1)}
        </span>
        {artefato.unit ? (
          <span className="text-sm text-muted-foreground">{artefato.unit}</span>
        ) : null}
        {meta ? <span className="ml-auto text-xs text-muted-foreground">{meta}</span> : null}
      </p>
      {fracao != null ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${fracao * 100}%` }} />
        </div>
      ) : null}
      {artefato.breakdown?.length ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {artefato.breakdown.map((parte) => (
            <li key={parte.label}>
              {parte.label}{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {numero(parte.value, 1)}
                {parte.unit ? ` ${parte.unit}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Uma barra por dia; a meta é a linha tracejada e o verde marca quem bateu. */
function BarsCard({ artefato }: De<'bars'>) {
  if (artefato.bars.length === 0) return vazio('Sem registros no período.');
  const maior = Math.max(artefato.goal ?? 0, ...artefato.bars.map((b) => b.value), 1);
  const eixo = barAxisLabels(artefato.bars);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex h-24 items-end gap-1.5">
        {artefato.goal ? (
          <div
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed border-foreground/30"
            style={{ bottom: `${(artefato.goal / maior) * 100}%` }}
          />
        ) : null}
        {artefato.bars.map((barra, indice) => (
          <div
            key={`${barra.label}-${indice}`}
            title={`${barra.label}: ${comUnidade(barra.value, artefato.unit)}`}
            className={cn('flex-1 rounded-md', barra.reached ? 'bg-primary' : 'bg-foreground/10')}
            style={{ height: `${Math.max(4, (barra.value / maior) * 100)}%` }}
          />
        ))}
      </div>
      <div
        data-testid="bars-axis"
        className={cn(
          'flex text-[11px] text-muted-foreground',
          eixo.perBar ? 'gap-1.5 text-center' : 'justify-between',
        )}
        aria-hidden
      >
        {eixo.labels.map((rotulo, indice) => (
          <span key={`${rotulo}-${indice}`} className={eixo.perBar ? 'flex-1 truncate' : undefined}>
            {rotulo}
          </span>
        ))}
      </div>
      {artefato.goal ? (
        <p className="text-xs text-muted-foreground">
          Linha tracejada: meta de {comUnidade(artefato.goal, artefato.unit)} · verde bateu
        </p>
      ) : null}
    </div>
  );
}

function LinhaDoTempo({ artefato }: De<'timeline'>) {
  if (artefato.events.length === 0) return vazio('Sem registros no período.');
  const unidade = artefato.unit ? ` ${artefato.unit}` : '';
  return (
    <div className="flex flex-col gap-1">
      {artefato.delta != null ? (
        <p>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold tabular-nums text-success">
            {artefato.delta > 0 ? '+' : ''}
            {numero(artefato.delta, 1)}
            {unidade} {timelinePeriodLabel(artefato.events)}
          </span>
        </p>
      ) : null}
      {/* A curva da prancha IA-Cartoes: só a linha, o ponto de hoje e três datas embaixo. */}
      <ResponsiveContainer width="100%" height={110}>
        <AreaChart data={artefato.events} margin={{ top: 10, right: 10, bottom: 4, left: 10 }}>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={['dataMin - 0.5', 'dataMax + 0.5']} />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: number) => [`${numero(v, 1)}${unidade}`, artefato.label ?? '']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            fill="transparent"
            dot={(p: { cx?: number; cy?: number; index?: number }) =>
              p.index === artefato.events.length - 1 ? (
                <circle key="hoje" cx={p.cx} cy={p.cy} r={5} fill="hsl(var(--primary))" />
              ) : (
                <g key={p.index} />
              )
            }
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex justify-between text-xs text-muted-foreground">
        {timelineAxisLabels(artefato.events).map((d, i) => (
          <span key={`${d}-${i}`}>{d}</span>
        ))}
      </div>
    </div>
  );
}

/** Itens com detalhe e valor; o total no pé. */
function ListaRica({ artefato }: De<'list'>) {
  if (artefato.items.length === 0) return vazio('Nada encontrado.');
  const visiveis = artefato.items.slice(0, MAX_LINHAS);
  return (
    <div className={cn(linhaDoCartao, 'px-3 py-1')}>
      <ul className="divide-y divide-border">
        {visiveis.map((item, indice) => (
          <li key={`${item.title}-${indice}`} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
              {item.detail ? (
                <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
              ) : null}
            </div>
            {item.value != null ? (
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {typeof item.value === 'number' ? numero(item.value, 1) : item.value}
                {item.unit ? ` ${item.unit}` : ''}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {artefato.items.length > visiveis.length ? (
        <p className="py-1 text-xs text-muted-foreground">
          e mais {artefato.items.length - visiveis.length}
        </p>
      ) : null}
      {artefato.total ? (
        <p className="border-t border-border py-2 text-right text-sm font-bold text-foreground">
          {artefato.total}
        </p>
      ) : null}
    </div>
  );
}

function Relatorio({ artefato }: De<'report'>) {
  if (artefato.rows.length === 0) return vazio('Nada no período.');
  const visiveis = artefato.rows.slice(0, MAX_LINHAS);
  const escondidas = artefato.rows.length - visiveis.length;
  return (
    <div className={cn(linhaDoCartao, 'overflow-x-auto px-1 py-1')}>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-muted-foreground">
            {artefato.columns.map((coluna) => (
              <th key={coluna} scope="col" className="whitespace-nowrap px-2 py-1 font-normal">
                {coluna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visiveis.map((linha, indice) => (
            <tr key={indice} className="border-t border-border">
              {linha.map((valor, coluna) => (
                <td
                  key={coluna}
                  className={cn(
                    'whitespace-nowrap px-2 py-1.5 text-foreground',
                    typeof valor === 'number' && 'text-right tabular-nums',
                  )}
                >
                  {celula(valor)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {escondidas > 0 ? (
        <p className="px-2 pt-1 text-xs text-muted-foreground">e mais {escondidas}</p>
      ) : null}
    </div>
  );
}

/** Onde o valor de hoje cai dentro da faixa mínima e máxima. */
function Faixa({ artefato }: De<'range'>) {
  if (artefato.rows.length === 0) return vazio('Nenhuma faixa definida.');
  return (
    <ul className={cn(linhaDoCartao, 'flex flex-col gap-3 px-3 py-3')}>
      {artefato.rows.map((linha) => {
        const teto = Math.max(linha.max ?? 0, linha.min ?? 0, linha.value, 1) * 1.15;
        const pos = (v: number) => `${Math.min(100, (v / teto) * 100)}%`;
        const faixa =
          linha.min != null && linha.max != null
            ? `${numero(linha.min)}–${numero(linha.max)}`
            : linha.min != null
              ? `a partir de ${numero(linha.min)}`
              : linha.max != null
                ? `até ${numero(linha.max)}`
                : '';
        return (
          <li key={linha.label} className="flex flex-col gap-1.5">
            <p className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-foreground/80">{linha.label}</span>
              <span className="text-xs text-muted-foreground">
                <span className="font-bold tabular-nums text-foreground">
                  {numero(linha.value, 1)}
                </span>
                {faixa ? ` / ${faixa}` : ''}
                {linha.unit ? ` ${linha.unit}` : ''}
              </span>
            </p>
            <div className="relative h-1.5 rounded-full bg-foreground/10" aria-hidden>
              {linha.min != null || linha.max != null ? (
                <div
                  className="absolute inset-y-0 rounded-full bg-foreground/25"
                  style={{
                    left: pos(linha.min ?? 0),
                    width: `calc(${pos(linha.max ?? teto)} - ${pos(linha.min ?? 0)})`,
                  }}
                />
              ) : null}
              <div
                className="absolute -top-1 h-3.5 w-1 rounded-full bg-primary"
                style={{ left: pos(linha.value) }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Anel({ percentual }: { percentual: number }) {
  const r = 16;
  const volta = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percentual));
  return (
    <svg viewBox="0 0 40 40" className="size-10 shrink-0 -rotate-90" aria-hidden>
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-foreground/10" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        className="stroke-primary"
        strokeDasharray={`${(p / 100) * volta} ${volta}`}
      />
    </svg>
  );
}

/** Um anel por meta, com o status ao lado. */
function Progresso({ artefato }: De<'progress'>) {
  if (artefato.items.length === 0) return vazio('Nenhuma meta ainda.');
  return (
    <ul className={cn(linhaDoCartao, 'divide-y divide-border px-3')}>
      {artefato.items.map((item, indice) => (
        <li key={`${item.title}-${indice}`} className="flex items-center gap-3 py-2.5">
          <div className="relative">
            <Anel percentual={item.percent} />
            <span className="absolute inset-0 grid place-items-center text-[10px] font-bold tabular-nums text-foreground">
              {Math.round(item.percent)}%
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
            {item.detail ? (
              <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
            ) : null}
          </div>
          {item.status ? (
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                /ativ|conclu|bateu/i.test(item.status)
                  ? 'bg-primary/15 text-success'
                  : 'bg-warning/15 text-warning',
              )}
            >
              {item.status}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const valorDaComparacao = (valor: number | string | undefined, unidade?: string) =>
  valor == null
    ? '—'
    : `${typeof valor === 'number' ? numero(valor, 1) : valor}${unidade ? ` ${unidade}` : ''}`;

/** Antes e agora lado a lado; o novo valor em destaque. */
function Comparacao({ artefato }: De<'comparison'>) {
  const comAntes = artefato.items.some((item) => item.before != null);
  return (
    <table className={cn(linhaDoCartao, 'w-full text-sm')}>
      {comAntes ? (
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="px-3 pt-2 text-left font-normal">
              <span className="sr-only">Item</span>
            </th>
            <th className="px-3 pt-2 text-left font-normal">Antes</th>
            <th className="px-3 pt-2 text-left font-normal text-success">Agora</th>
          </tr>
        </thead>
      ) : null}
      <tbody>
        {artefato.items.map((item) => (
          <tr key={item.label} className="border-t border-border first:border-t-0">
            <th scope="row" className="px-3 py-2 text-left font-normal text-foreground/70">
              {item.label}
            </th>
            {comAntes ? (
              <td className="px-3 py-2 tabular-nums text-foreground/70">
                {valorDaComparacao(item.before, item.unit)}
              </td>
            ) : null}
            <td className="px-3 py-2 text-right font-bold tabular-nums text-foreground">
              {valorDaComparacao(item.value, item.unit)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('');

/** Posições do desafio; a sua linha em verde. */
function Placar({ artefato }: De<'scoreboard'>) {
  if (artefato.entries.length === 0) return vazio('Ninguém pontuou ainda.');
  return (
    <ol className={cn(linhaDoCartao, 'overflow-hidden')}>
      {artefato.entries.map((linha) => (
        <li
          key={`${linha.position}-${linha.name}`}
          aria-current={linha.you ? 'true' : undefined}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 text-sm',
            linha.you && 'bg-primary/15',
          )}
        >
          <span className="w-4 tabular-nums text-foreground/70">{linha.position}</span>
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-full bg-foreground/10 text-[10px] font-bold text-foreground"
          >
            {iniciais(linha.name)}
          </span>
          <span className={cn('flex-1 truncate text-foreground', linha.you && 'font-bold')}>
            {linha.name}
          </span>
          <span className="font-semibold tabular-nums text-foreground">
            {comUnidade(linha.value, linha.unit)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Conquistas em grade; as bloqueadas ficam apagadas, com cadeado. */
function Selos({ artefato }: De<'badges'>) {
  if (artefato.badges.length === 0) return vazio('Nenhuma conquista ainda.');
  return (
    <ul className="grid grid-cols-4 gap-x-2 gap-y-3">
      {artefato.badges.map((selo, indice) => (
        <li
          key={`${selo.title}-${indice}`}
          className="flex flex-col items-center gap-1 text-center"
        >
          <span
            className={cn(
              'relative grid size-11 place-items-center rounded-full',
              selo.unlocked
                ? 'bg-primary/15 text-success'
                : 'bg-foreground/[0.06] text-foreground/35',
            )}
          >
            <Medal className="size-5" aria-hidden />
            {selo.unlocked ? null : (
              <Lock
                className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-background p-0.5"
                aria-label="Bloqueada"
              />
            )}
          </span>
          <span
            className={cn(
              'text-[11px] leading-tight',
              selo.unlocked ? 'text-foreground/80' : 'text-foreground/45',
            )}
          >
            {selo.title}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Passos numerados. */
function Instrucoes({ artefato }: De<'instructions'>) {
  return (
    <ol className="flex flex-col gap-3">
      {artefato.steps.map((passo, indice) => (
        <li key={indice} className="flex gap-3 text-sm text-foreground/85">
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/10 text-xs font-bold text-foreground"
          >
            {indice + 1}
          </span>
          <span className="pt-0.5">{passo}</span>
        </li>
      ))}
    </ol>
  );
}

/** O arquivo pronto e o botão de baixar. */
function Arquivo({ artefato }: De<'file'>) {
  const expira = new Date(artefato.expiresAt);
  return (
    <div className="flex flex-col gap-2.5">
      <p className={cn(linhaDoCartao, 'flex items-center gap-3 px-3 py-2.5')}>
        <FileText className="size-5 shrink-0 text-foreground/60" aria-hidden />
        <span className="truncate text-sm font-semibold text-foreground">{artefato.filename}</span>
      </p>
      <a
        href={artefato.url}
        download={artefato.filename}
        className={cn(inkButton, 'rounded-full px-4 py-2.5 text-center text-sm font-bold')}
      >
        Baixar
      </a>
      {Number.isNaN(expira.getTime()) ? null : (
        <p className="text-xs text-muted-foreground">
          O link vale até {celula(artefato.expiresAt)}.
        </p>
      )}
    </div>
  );
}

/** Os sites da busca, numerados como o texto os cita. */
function Fontes({ artefato }: De<'sources'>) {
  if (artefato.sources.length === 0) return vazio('A busca não trouxe nada.');
  return (
    <ol className={cn(linhaDoCartao, 'divide-y divide-border px-3')}>
      {artefato.sources.map((fonte, indice) => (
        <li key={fonte.url}>
          <a
            href={fonte.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 py-2.5 hover:opacity-80"
          >
            <span className="w-3 text-xs tabular-nums text-muted-foreground">{indice + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">
                {fonte.title || fonte.domain}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{fonte.domain}</span>
            </span>
            <ArrowUpRight className="size-4 shrink-0 text-foreground/50" aria-hidden />
          </a>
        </li>
      ))}
    </ol>
  );
}

/** Apagar, sair ou autorizar: a IA explica e abre a tela certa (ela mesma nunca faz). */
function SoNoApp({ artefato }: De<'app_only'>) {
  const catalogo = useCatalogoDasTools();
  const entrada = catalogo?.[artefato.tool];
  const link = appOnlyHref(entrada, artefato.params);
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-sm text-foreground/70">
        Isso não tem volta ou mexe no acesso de alguém, então é feito na tela, onde dá para conferir
        antes.
      </p>
      {link && entrada?.appOnly ? (
        <Link
          href={link}
          className={cn(
            inkButton,
            'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold',
          )}
        >
          <ArrowUpRight className="size-4" aria-hidden />
          Abrir {entrada.appOnly.screen}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * "Gravado", com Desfazer (ADR 039): o `/mcp` emite o artefato na gravação automática, e o
 * Desfazer volta o estado de antes pela API. Sem `onDesfazer`, o botão não aparece. Numa
 * alteração, cada linha mostra antes → depois. `doServidor` é o estado lido da API, para o cartão
 * recarregado dizer "Desfeito" ou que o prazo passou (#385).
 */
export function Gravado({
  artefato,
  onDesfazer,
  doServidor,
}: De<'saved'> & {
  onDesfazer?: () => Promise<void> | void;
  doServidor?: SavedCardState;
}) {
  // O que aconteceu nesta tela vale mais que o lido do servidor; sem nada local, vale o servidor.
  const [local, setEstado] = useState<SavedCardState | null>(null);
  const estado: SavedCardState = local ?? doServidor ?? 'saved';
  const comBotao =
    (estado === 'saved' || estado === 'undoing' || estado === 'failed') && !!onDesfazer;
  const aviso =
    estado === 'undone' || estado === 'expired' || estado === 'changed' || estado === 'failed'
      ? SAVED_CARD_COPY[estado]
      : null;
  return (
    <div className="flex flex-col gap-2.5">
      {artefato.lines.length ? (
        <dl className={cn(linhaDoCartao, 'divide-y divide-border px-3')}>
          {artefato.lines.map((linha) => (
            <div key={linha.label} className="flex items-baseline gap-2 py-2 text-sm">
              <dt className="flex-1 text-foreground/60">{linha.label}</dt>
              <dd className="text-right font-semibold text-foreground">
                {linha.before ? (
                  <span className="font-normal text-foreground/45">{`${linha.before} → `}</span>
                ) : null}
                {linha.after}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {aviso ? (
        <p
          role={estado === 'failed' || estado === 'changed' ? 'alert' : undefined}
          className="text-xs text-muted-foreground"
        >
          {aviso}
        </p>
      ) : null}
      {artefato.undoable && comBotao ? (
        <button
          type="button"
          disabled={estado === 'undoing'}
          onClick={async () => {
            setEstado('undoing');
            try {
              await onDesfazer?.();
              setEstado('undone');
            } catch (erro) {
              setEstado(undoFailureState(erro));
            }
          }}
          className={cn(ghostButton, 'self-start rounded-full px-4 py-1.5 text-sm')}
        >
          {estado === 'undoing' ? SAVED_CARD_COPY.undoing : SAVED_CARD_COPY.undo}
        </button>
      ) : null}
    </div>
  );
}

/** O Desfazer de verdade: pela API, e depois relê tudo — o registro desfeito sai das telas. */
function GravadoComDesfazer({ artefato }: De<'saved'>) {
  const queryClient = useQueryClient();
  const id = savedUndoId(artefato);
  // O estado guardado no servidor: recarregar a conversa não pode oferecer de novo o que já foi
  // desfeito, nem um Desfazer vencido.
  const status = useQuery({
    queryKey: ['chat', 'auto-write', id],
    queryFn: () => getAutoWriteStatus(id as string),
    enabled: !!id,
    staleTime: 30_000,
  });
  return (
    <Gravado
      artefato={artefato}
      doServidor={status.data ? savedStateFromStatus(status.data.state) : undefined}
      onDesfazer={
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

const ICONES: Record<ChatArtifact['kind'], ComponentType<{ className?: string }>> = {
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

function CardBody({ artefato }: { artefato: ChatArtifact }): ReactNode {
  switch (artefato.kind) {
    case 'metric':
      return <Metrica artefato={artefato} />;
    case 'bars':
      return <BarsCard artefato={artefato} />;
    case 'timeline':
      return <LinhaDoTempo artefato={artefato} />;
    case 'list':
      return <ListaRica artefato={artefato} />;
    case 'report':
      return <Relatorio artefato={artefato} />;
    case 'range':
      return <Faixa artefato={artefato} />;
    case 'progress':
      return <Progresso artefato={artefato} />;
    case 'comparison':
      return <Comparacao artefato={artefato} />;
    case 'scoreboard':
      return <Placar artefato={artefato} />;
    case 'badges':
      return <Selos artefato={artefato} />;
    case 'instructions':
      return <Instrucoes artefato={artefato} />;
    case 'file':
      return <Arquivo artefato={artefato} />;
    case 'sources':
      return <Fontes artefato={artefato} />;
    case 'app_only':
      return <SoNoApp artefato={artefato} />;
    case 'saved':
      return <GravadoComDesfazer artefato={artefato} />;
  }
}

/**
 * O cartão inteiro: cabeçalho igual em todos (ícone, ferramenta pequena, resultado como
 * título) e o corpo do formato. `toolTitle` é o título da tool em português. Um formato que
 * este PWA não sabe desenhar (API mais nova, carga sem o campo principal) vira um aviso neutro.
 */
export function ChatArtifactCard({
  artifact: artefato,
  toolTitle: ferramenta,
}: {
  artifact: ChatArtifact;
  toolTitle?: string;
}) {
  if (!isRenderableChatArtifact(artefato)) {
    return (
      <figure
        aria-label={ferramenta ?? 'Cartão'}
        className={cn(field, 'flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5')}
      >
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-foreground/[0.08] text-foreground/70"
        >
          <Lock className="size-[18px]" />
        </span>
        <figcaption className="min-w-0 flex-1">
          {ferramenta ? (
            <span className="block truncate text-xs text-muted-foreground">{ferramenta}</span>
          ) : null}
          <span className="block text-sm text-foreground/75">{UNKNOWN_CHAT_ARTIFACT_TEXT}</span>
        </figcaption>
      </figure>
    );
  }
  const titulo = chatCardTitle(artefato);
  const acima = cardEyebrow(artefato.kind, ferramenta);
  const Icone = ICONES[artefato.kind];
  const video = artefato.kind === 'instructions' ? artefato.videoUrl : undefined;
  return (
    <figure
      aria-label={titulo}
      className={cn(field, 'flex w-full flex-col gap-3 rounded-2xl px-3.5 py-3.5')}
    >
      <figcaption className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-xl',
            artefato.kind === 'app_only'
              ? 'bg-foreground/[0.08] text-foreground/70'
              : 'bg-primary/15 text-success',
          )}
        >
          <Icone className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          {acima ? (
            <span className="block truncate text-xs text-muted-foreground">{acima}</span>
          ) : null}
          <span className="block text-[15px] font-bold leading-snug text-foreground">{titulo}</span>
        </span>
        {video ? (
          <a
            href={video}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs font-semibold text-success hover:underline"
          >
            Ver vídeo
          </a>
        ) : null}
      </figcaption>
      <CardBody artefato={artefato} />
    </figure>
  );
}
