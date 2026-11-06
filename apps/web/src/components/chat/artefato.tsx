'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChatArtifact } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { field } from '@/components/elements/surfaces';

/**
 * O artefato de uma tool: o número, a série ou a tabela que ela devolveu, desenhado
 * direto do `structuredContent` — sem passar pela prosa do modelo, que poderia
 * transcrever "1.832 kcal" como "1.823".
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

function Metrica({ artefato }: { artefato: Extract<ChatArtifact, { kind: 'metric' }> }) {
  const { min, max } = artefato.target ?? {};
  const meta =
    min != null && max != null
      ? `meta ${numero(min)}–${numero(max)}`
      : min != null
        ? `meta a partir de ${numero(min)}`
        : max != null
          ? `meta até ${numero(max)}`
          : null;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline gap-1.5">
        <span className="text-2xl font-extrabold tabular-nums text-foreground">
          {numero(artefato.value, 1)}
        </span>
        {artefato.unit ? (
          <span className="text-sm text-muted-foreground">{artefato.unit}</span>
        ) : null}
        {meta ? <span className="ml-auto text-xs text-muted-foreground">{meta}</span> : null}
      </p>
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

function LinhaDoTempo({ artefato }: { artefato: Extract<ChatArtifact, { kind: 'timeline' }> }) {
  if (artefato.events.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem registros no período.</p>;
  }
  const unidade = artefato.unit ? ` ${artefato.unit}` : '';
  return (
    <div className="flex flex-col gap-1">
      {artefato.delta != null ? (
        <p className="text-sm text-muted-foreground">
          Variação{' '}
          <span className="font-semibold tabular-nums text-foreground">
            {artefato.delta > 0 ? '+' : ''}
            {numero(artefato.delta, 1)}
            {unidade}
          </span>
        </p>
      ) : null}
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={artefato.events} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="date"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickFormatter={(v: string) => v.slice(5, 10)}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            width={36}
            domain={['dataMin - 1', 'dataMax + 1']}
            tickFormatter={(v: number) => numero(v, 1)}
          />
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
            fill="hsl(var(--primary) / 0.2)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Relatorio({ artefato }: { artefato: Extract<ChatArtifact, { kind: 'report' }> }) {
  if (artefato.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nada no período.</p>;
  }
  const visiveis = artefato.rows.slice(0, MAX_LINHAS);
  const escondidas = artefato.rows.length - visiveis.length;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-muted-foreground">
            {artefato.columns.map((coluna) => (
              <th key={coluna} scope="col" className="whitespace-nowrap px-2 py-1 font-semibold">
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
                    'whitespace-nowrap px-2 py-1 text-foreground',
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

function Comparacao({ artefato }: { artefato: Extract<ChatArtifact, { kind: 'comparison' }> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {artefato.items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="text-right font-semibold tabular-nums text-foreground">
            {typeof item.value === 'number' ? numero(item.value, 1) : item.value}
            {item.unit ? ` ${item.unit}` : ''}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Artefato({ artefato }: { artefato: ChatArtifact }) {
  return (
    <figure
      aria-label={artefato.label ?? 'Resultado'}
      className={cn(field, 'flex w-full flex-col gap-2 rounded-xl px-3.5 py-3')}
    >
      {artefato.label ? (
        <figcaption className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
          {artefato.label}
        </figcaption>
      ) : null}
      {artefato.kind === 'metric' ? (
        <Metrica artefato={artefato} />
      ) : artefato.kind === 'timeline' ? (
        <LinhaDoTempo artefato={artefato} />
      ) : artefato.kind === 'comparison' ? (
        <Comparacao artefato={artefato} />
      ) : (
        <Relatorio artefato={artefato} />
      )}
    </figure>
  );
}
