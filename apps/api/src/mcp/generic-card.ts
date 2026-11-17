import { CAMPOS } from '../chat/previa/rotulos';

/**
 * A Tabela de quem não tem cartão próprio (#384, prancha IA-Cartoes: "Padrão quando não há
 * outro formato").
 *
 * Lê o resultado da tool como ele vai ao modelo e acha a lista: o próprio resultado, ou o único
 * array dentro dele. As colunas são os campos que têm rótulo em português (`CAMPOS`, o mesmo do
 * cartão de confirmação): campo sem rótulo, id e objeto aninhado ficam de fora, para a pessoa
 * nunca ler `loggedAt` nem `{"a":1}`. Sem coluna numérica não há cartão — a prancha só desenha
 * cartão quando há número.
 */

const MAX_COLUNAS = 4;
const MAX_LINHAS = 20;

type Celula = string | number | null;

export interface GenericTable {
  kind: 'report';
  columns: string[];
  rows: Celula[][];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function lista(dados: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(dados)) return dados.every(isRecord) ? dados : null;
  if (!isRecord(dados)) return null;
  const arrays = Object.values(dados).filter(Array.isArray);
  return arrays.length === 1 ? lista(arrays[0]) : null;
}

function celula(valor: unknown): Celula | undefined {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor === 'string') return valor;
  return undefined;
}

export function genericTable(dados: unknown): GenericTable | null {
  const linhas = lista(dados);
  if (!linhas?.length) return null;
  const chaves: string[] = [];
  for (const linha of linhas) {
    for (const [chave, valor] of Object.entries(linha)) {
      if (chaves.includes(chave) || !CAMPOS[chave]) continue;
      if (celula(valor) === undefined) continue;
      chaves.push(chave);
    }
  }
  const colunas = chaves.slice(0, MAX_COLUNAS);
  const temNumero = colunas.some((c) => linhas.some((l) => typeof l[c] === 'number'));
  if (!temNumero) return null;
  return {
    kind: 'report',
    columns: colunas.map((c) => CAMPOS[c].rotulo),
    rows: linhas.slice(0, MAX_LINHAS).map((l) => colunas.map((c) => celula(l[c]) ?? null)),
  };
}

export interface GenericList {
  kind: 'list';
  items: { title: string; detail?: string }[];
}

const CAMPOS_DE_TITULO = ['name', 'title', 'nickname', 'content', 'body'] as const;

/**
 * A Lista de quem declara `list` e não tem produtor próprio (#384): um item por objeto, com o
 * primeiro campo de título que houver. Sem título em nenhum, não há cartão — um item "sem nome"
 * diria menos que a linha da tool.
 */
export function genericList(dados: unknown): GenericList | null {
  const linhas = lista(dados);
  if (!linhas?.length) return null;
  const itens = linhas.slice(0, MAX_LINHAS).flatMap((linha) => {
    const campo = CAMPOS_DE_TITULO.find((c) => typeof linha[c] === 'string' && linha[c]);
    return campo ? [{ title: String(linha[campo]).slice(0, 120) }] : [];
  });
  return itens.length ? { kind: 'list', items: itens } : null;
}
