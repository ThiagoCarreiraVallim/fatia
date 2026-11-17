import { CAMPOS, OCULTOS, dataEHora, dia, type Campo } from '../chat/previa/rotulos';

/**
 * A Tabela e a Lista de quem não tem cartão próprio (#384, prancha IA-Cartoes: "Padrão quando
 * não há outro formato").
 *
 * Lê o resultado da tool como ele vai ao modelo e acha o que desenhar:
 *
 * - uma lista: o próprio resultado, ou a primeira lista não vazia de objetos dentro dele
 *   (`{ logs: [...], nextCursor }`, `{ favorites: [], recent: [...] }`);
 * - sem lista, o próprio objeto, campo a campo (`get_me`, `get_exercise_details`): rótulo e
 *   valor, na Tabela como duas colunas e na Lista como um item por campo.
 *
 * Aparece primeiro o campo com rótulo em português — `CAMPOS`, o mesmo do cartão de
 * confirmação, mais os campos que só existem em resultado (`ROTULOS_DO_RESULTADO`) —, para a
 * pessoa não ler `loggedAt` nem `{"a":1}`. Só quando nenhum campo tem rótulo o nome do campo
 * vira o rótulo, legível ("Logged at"): um cartão assim ainda diz mais que nenhum. Id e campo
 * técnico (`TECNICOS`) nunca aparecem. Objeto aninhado com `name` ou `title` vira esse nome
 * ("Supino reto", e não `{ id, name, ... }`). Uma lista de textos soltos vira um item por texto.
 *
 * Só não há cartão quando não sobra nada para mostrar: lista vazia, ou só id e campo técnico.
 */

const MAX_COLUNAS = 4;
const MAX_LINHAS = 20;
const MAX_CAMPOS = 12;
const MAX_TITULO = 120;
const MAX_DETALHE = 160;
const PARTES_DO_DETALHE = 3;

type Celula = string | number | null;

export interface GenericTable {
  kind: 'report';
  label?: string;
  columns: string[];
  rows: Celula[][];
}

export interface GenericList {
  kind: 'list';
  label?: string;
  items: { title: string; detail?: string }[];
}

type Registro = Record<string, unknown>;

const isRecord = (v: unknown): v is Registro =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);

const isRecordList = (v: unknown): v is Registro[] =>
  Array.isArray(v) && v.length > 0 && v.every(isRecord);

/** O formato de quem só desenha texto, sem fuso: as datas não passam por ele (ver `cellOf`). */
const SEM_FUSO = { timezone: 'UTC', agora: new Date(0) };

const fmt = (campo: string) => CAMPOS[campo]?.formato;

const deMapa =
  (mapa: Record<string, string>, resto?: Campo['formato']): Campo['formato'] =>
  (valor, ctx) =>
    typeof valor === 'string' ? (mapa[valor] ?? resto?.(valor, ctx) ?? valor) : null;

const PAPEL: Record<string, string> = {
  USER: 'Pessoa',
  ADMIN: 'Administrador',
  OWNER: 'Dono',
  PROFESSIONAL: 'Profissional',
  CREATOR: 'Criador',
  MEMBER: 'Membro',
};

const ESCOPO = (valor: unknown) =>
  typeof valor === 'string' ? (fmt('scopes')?.([valor], SEM_FUSO) ?? valor) : null;

const TIPO: Record<string, string> = {
  plan: 'Plano',
  circuit: 'Circuito',
  free: 'Livre',
  STRENGTH: 'Força',
  CIRCUIT: 'Circuito',
  WORKOUT: 'Treino',
  NUTRITION: 'Alimentação',
  strength: 'Força',
  cardio: 'Cardio',
};

const SITUACAO: Record<string, string> = {
  ACTIVE: 'Ativo',
  INVITED: 'Convidado',
  PENDING: 'Esperando resposta',
  ACCEPTED: 'Aceito',
  DECLINED: 'Recusado',
  upcoming: 'Em breve',
  running: 'Em andamento',
  ended: 'Encerrado',
  done: 'Feito',
  missed: 'Perdido',
  today: 'Hoje',
  planned: 'Planejado',
};

const ORIGEM_DO_ALIMENTO: Record<string, string> = {
  TACO: 'TACO',
  USDA: 'USDA',
  CUSTOM: 'Cadastrado por você',
};

const nome = fmt('name');
const simOuNao = fmt('favorite');
const semUnidade = fmt('min');

/**
 * Os campos que só aparecem em resultado — nenhuma escrita os recebe, então não moram em
 * `CAMPOS`. Um campo daqui com o mesmo nome de lá vale só no cartão genérico.
 */
const ROTULOS_DO_RESULTADO: Record<string, Campo> = {
  email: { rotulo: 'E-mail', formato: nome },
  role: { rotulo: 'Papel', formato: deMapa(PAPEL) },
  kind: { rotulo: 'Tipo', formato: deMapa(TIPO, fmt('kind')) },
  status: { rotulo: 'Situação', formato: deMapa(SITUACAO, fmt('status')) },
  source: { rotulo: 'Origem', formato: deMapa(ORIGEM_DO_ALIMENTO, fmt('source')) },
  exercise: { rotulo: 'Exercício' },
  exerciseName: { rotulo: 'Exercício', formato: nome },
  // `group` é a comunidade num convite e o grupo muscular no resumo da semana.
  group: { rotulo: 'Grupo' },
  sets: { rotulo: 'Séries', formato: semUnidade },
  groupName: { rotulo: 'Comunidade', formato: nome },
  communityName: { rotulo: 'Comunidade', formato: nome },
  community: { rotulo: 'Comunidade' },
  team: { rotulo: 'Equipe' },
  plan: { rotulo: 'Plano' },
  planName: { rotulo: 'Plano', formato: nome },
  author: { rotulo: 'Autor' },
  authorName: { rotulo: 'Autor', formato: nome },
  professionalName: { rotulo: 'Profissional', formato: nome },
  at: { rotulo: 'Quando', formato: dataEHora },
  scope: { rotulo: 'Categoria', formato: ESCOPO },
  scopesGrantedToMe: { rotulo: 'Compartilha com você', formato: fmt('scopes') },
  consentScopes: { rotulo: 'Compartilha com a equipe', formato: fmt('scopes') },
  denied: { rotulo: 'Negado', formato: simOuNao },
  joinedAt: { rotulo: 'Entrou em', formato: dia },
  publishedAt: { rotulo: 'Publicado em', formato: dia },
  timesDone: { rotulo: 'Vezes feito', formato: semUnidade },
  lastDoneAt: { rotulo: 'Última vez', formato: dia },
  timesEaten: { rotulo: 'Vezes comido', formato: semUnidade },
  lastGrams: { rotulo: 'Última quantidade', formato: fmt('grams') },
  maxWeightKg: { rotulo: 'Maior carga', formato: fmt('weightKg') },
  repsAtMax: { rotulo: 'Repetições', formato: semUnidade },
  estimated1RM: { rotulo: '1RM estimado', formato: fmt('weightKg') },
  totalSets: { rotulo: 'Séries feitas', formato: semUnidade },
  achievedAt: { rotulo: 'Quando', formato: dia },
  participants: { rotulo: 'Participantes', formato: semUnidade },
  memberCount: { rotulo: 'Membros', formato: semUnidade },
  commentCount: { rotulo: 'Comentários', formato: semUnidade },
  pinned: { rotulo: 'Fixado', formato: simOuNao },
  startDate: { rotulo: 'Começa', formato: dia },
  endDate: { rotulo: 'Termina', formato: dia },
  unread: { rotulo: 'Não lidos', formato: semUnidade },
};

/** O que não é dado da pessoa: chave de busca, cursor, segredo, marca interna. */
const TECNICOS = new Set([
  'searchName',
  'clientKey',
  'nextCursor',
  'cursor',
  'token',
  'tokenHash',
  'passwordHash',
  'userAgent',
  'ip',
  '__typename',
]);

const isTechnical = (chave: string) =>
  chave === 'id' ||
  chave.endsWith('Id') ||
  chave.endsWith('Ids') ||
  OCULTOS.has(chave) ||
  TECNICOS.has(chave);

/**
 * O campo como aparece no cartão; `null` quando não aparece. Sem `legivel`, só o que tem rótulo
 * em português; com ele, o resto ganha o nome do campo legível ("loggedAt" → "Logged at").
 */
function fieldOf(chave: string, legivel = false): Campo | null {
  if (isTechnical(chave)) return null;
  const campo = ROTULOS_DO_RESULTADO[chave] ?? CAMPOS[chave];
  if (campo) return campo;
  return legivel ? { rotulo: readableKey(chave) } : null;
}

/** "loggedAt" → "Logged at", "kcal_total" → "Kcal total". */
export function readableKey(chave: string): string {
  const palavras = chave
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return palavras.charAt(0).toUpperCase() + palavras.slice(1);
}

/** O título que um objeto aninhado tem, quando tem: "Supino reto", e não o objeto. */
function nameOf(valor: unknown): string | null {
  if (!isRecord(valor)) return null;
  for (const chave of ['name', 'title', 'displayName'] as const) {
    const v = valor[chave];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

const isDateField = (campo: Campo) => campo.formato === dataEHora || campo.formato === dia;

/**
 * O valor de um campo, como a pessoa lê. `undefined` = o campo não tem como aparecer (lista de
 * objetos, objeto sem nome). Data sai em ISO: o cartão fica gravado e reaparece dias depois, e
 * "hoje" já seria mentira — quem desenha formata no fuso de quem lê.
 */
function cellOf(campo: Campo, valor: unknown): Celula | undefined {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    const iso = valor.toISOString();
    // Data sem hora (nascimento): o formato do campo lê "YYYY-MM-DD".
    return isDateField(campo) || !campo.formato
      ? iso
      : (campo.formato(iso.slice(0, 10), SEM_FUSO) ?? iso);
  }
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string' && isDateField(campo)) return valor;
  if (Array.isArray(valor) && valor.some(isRecord)) return undefined;
  if (isRecord(valor)) {
    const titulo = nameOf(valor);
    if (titulo) return titulo;
  }
  const texto = campo.formato?.(valor, SEM_FUSO);
  if (texto) return texto;
  if (typeof valor === 'string') return valor.trim() || null;
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (Array.isArray(valor)) return valor.length ? valor.map(String).join(', ') : null;
  return undefined;
}

/** O mesmo valor, como texto de uma linha da Lista: o número leva a unidade do campo. */
function textOf(campo: Campo, valor: unknown): string | null {
  const v = cellOf(campo, valor);
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return campo.formato?.(v, SEM_FUSO) ?? String(v);
  return v;
}

/**
 * A lista que o resultado traz: ele mesmo, a primeira lista não vazia de objetos nele, ou, sem
 * nenhuma, a primeira um nível abaixo (`{ date, active: { meals: [...] } }`).
 */
function listOf(dados: unknown): Registro[] | null {
  if (Array.isArray(dados)) return isRecordList(dados) ? dados : null;
  if (!isRecord(dados)) return null;
  const valores = Object.values(dados);
  const lista = valores.find(isRecordList);
  if (lista) return lista;
  for (const valor of valores) {
    if (!isRecord(valor)) continue;
    const aninhada = Object.values(valor).find(isRecordList);
    if (aninhada) return aninhada;
  }
  return null;
}

/**
 * O nome do objeto que traz a lista, para o título do cartão: o plano, a comunidade do
 * convite. Só quando a lista veio de dentro de um objeto.
 */
function cardLabelOf(dados: unknown): { label?: string } {
  if (!isRecord(dados)) return {};
  const label = nameOf(dados) ?? ANINHADOS_DE_TITULO.map((c) => nameOf(dados[c])).find(Boolean);
  return label ? { label: label.slice(0, MAX_TITULO) } : {};
}

const isInstant = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);

/** Os campos de um objeto solto, rótulo e texto, na ordem em que vêm. */
function objectFields(objeto: unknown, legivel: boolean): [string, string][] {
  if (!isRecord(objeto)) return [];
  const linhas: [string, string][] = [];
  for (const [chave, valor] of Object.entries(objeto)) {
    const campo = fieldOf(chave, legivel);
    // Instante sem rótulo não tem formato de data: em ISO ele não se lê.
    if (!campo || (legivel && (valor instanceof Date || isInstant(valor)))) continue;
    const texto = textOf(campo, valor);
    if (texto) linhas.push([campo.rotulo, texto.slice(0, MAX_DETALHE)]);
    if (linhas.length === MAX_CAMPOS) break;
  }
  return linhas;
}

/**
 * O que mostrar de um resultado sem lista de objetos: os campos com rótulo em português; sem
 * nenhum, a lista de textos soltos que ele traga; sem ela, os campos pelo nome legível.
 */
function withoutObjectList(
  dados: unknown,
): { campos: [string, string][] } | { soltos: (string | number)[] } | null {
  const comRotulo = objectFields(dados, false);
  if (comRotulo.length) return { campos: comRotulo };
  const soltos = looseValuesOf(dados);
  if (soltos) return { soltos: soltos.slice(0, MAX_LINHAS) };
  const legiveis = objectFields(dados, true);
  return legiveis.length ? { campos: legiveis } : null;
}

const isLoose = (v: unknown) =>
  (typeof v === 'string' && v.trim() !== '') || (typeof v === 'number' && Number.isFinite(v));

/**
 * Uma lista só de textos ou números (`["Peito", "Costas"]`), o resultado ou a primeira dentro
 * dele; `null` se não houver. Num objeto, só vale quando os campos dele não têm o que mostrar.
 */
function looseValuesOf(dados: unknown): (string | number)[] | null {
  const lista = Array.isArray(dados)
    ? dados
    : isRecord(dados)
      ? Object.values(dados).find((v) => Array.isArray(v) && v.length > 0 && v.every(isLoose))
      : null;
  return Array.isArray(lista) && lista.length > 0 && lista.every(isLoose)
    ? (lista as (string | number)[])
    : null;
}

const CAMPOS_DE_TITULO = [
  'name',
  'title',
  'foodName',
  'exerciseName',
  'displayName',
  'professionalName',
  'planName',
  'groupName',
  'nickname',
  'content',
  'body',
] as const;

/** Os objetos aninhados que dão nome à linha quando ela não tem um próprio. */
const ANINHADOS_DE_TITULO = ['exercise', 'plan', 'group', 'author'] as const;

/** A chave que dá o título da linha: um campo de texto, ou um objeto aninhado com nome. */
function titleKeyOf(linha: Registro): string | null {
  const propria = CAMPOS_DE_TITULO.find((c) => typeof linha[c] === 'string' && linha[c]);
  if (propria) return propria;
  return ANINHADOS_DE_TITULO.find((c) => nameOf(linha[c])) ?? null;
}

/** O rótulo e o valor da coluna do nome da linha, tenha ou não rótulo em `CAMPOS`. */
const titleFieldOf = (chave: string): Campo => fieldOf(chave) ?? { rotulo: 'Nome' };

/** As colunas de uma lista de objetos: o nome da linha, os números, e o resto do texto. */
function columnsOf(linhas: Registro[], titulo: string | null, legivel: boolean): string[] {
  const numericas: string[] = [];
  const outras: string[] = [];
  for (const linha of linhas) {
    for (const [chave, valor] of Object.entries(linha)) {
      if (chave === titulo || numericas.includes(chave) || outras.includes(chave)) continue;
      const campo = fieldOf(chave, legivel);
      if (!campo) continue;
      const v = cellOf(campo, valor);
      if (v === undefined || v === null) continue;
      (typeof v === 'number' ? numericas : outras).push(chave);
    }
  }
  return [...(titulo ? [titulo] : []), ...numericas, ...outras].slice(0, MAX_COLUNAS);
}

export function genericTable(dados: unknown): GenericTable | null {
  const linhas = listOf(dados);
  if (!linhas) {
    const conteudo = withoutObjectList(dados);
    if (!conteudo) return null;
    return 'campos' in conteudo
      ? { kind: 'report', columns: ['Campo', 'Valor'], rows: conteudo.campos }
      : { kind: 'report', columns: ['Valor'], rows: conteudo.soltos.map((v) => [v]) };
  }

  // O nome da linha primeiro, os números em seguida — a prancha desenha a Tabela para comparar
  // número —, e o resto do texto enquanto houver coluna. Sem número a Tabela sai do mesmo jeito.
  const titulo = titleKeyOf(linhas[0]);
  let legivel = false;
  let chaves = columnsOf(linhas, titulo, legivel);
  if (chaves.length <= (titulo ? 1 : 0)) {
    legivel = true;
    chaves = columnsOf(linhas, titulo, legivel);
  }
  if (!chaves.length) return null;
  const campoDaColuna = (c: string) =>
    c === titulo ? titleFieldOf(c) : (fieldOf(c, legivel) as Campo);
  return {
    kind: 'report',
    ...cardLabelOf(dados),
    columns: chaves.map((c) => campoDaColuna(c).rotulo),
    rows: linhas
      .slice(0, MAX_LINHAS)
      .map((l) => chaves.map((c) => cellOf(campoDaColuna(c), l[c]) ?? null)),
  };
}

/**
 * A Lista de quem declara `list` e não tem produtor próprio (#384): um item por objeto, com o
 * título do primeiro campo de nome que houver e, no detalhe, os primeiros campos com rótulo. Um
 * objeto solto vira um item por campo.
 */
export function genericList(dados: unknown): GenericList | null {
  const linhas = listOf(dados);
  if (!linhas) {
    const conteudo = withoutObjectList(dados);
    if (!conteudo) return null;
    const items =
      'campos' in conteudo
        ? conteudo.campos.map(([title, detail]) => ({ title, detail }))
        : conteudo.soltos.map((v) => ({ title: String(v).slice(0, MAX_TITULO) }));
    return { kind: 'list', items };
  }

  const itensDe = (legivel: boolean) =>
    linhas.slice(0, MAX_LINHAS).flatMap((linha) => itemOf(linha, legivel));
  const itens = itensDe(false);
  const lidos = itens.length ? itens : itensDe(true);
  return lidos.length ? { kind: 'list', ...cardLabelOf(dados), items: lidos } : null;
}

/** Um objeto como item da Lista: o título e, no detalhe, os primeiros campos com rótulo. */
function itemOf(linha: Registro, legivel: boolean): GenericList['items'] {
  const chave = titleKeyOf(linha);
  const partes: string[] = [];
  for (const [c, valor] of Object.entries(linha)) {
    if (c === chave || partes.length === PARTES_DO_DETALHE) continue;
    const campo = fieldOf(c, legivel);
    // Momento fica de fora do detalhe: em ISO ele não se lê, e formatado viraria "hoje".
    if (!campo || isDateField(campo) || valor instanceof Date || isInstant(valor)) continue;
    const texto = textOf(campo, valor);
    if (texto) partes.push(`${campo.rotulo}: ${texto}`);
  }
  const titulo = chave
    ? typeof linha[chave] === 'string'
      ? (linha[chave] as string)
      : nameOf(linha[chave])
    : partes.shift();
  if (!titulo) return [];
  const detalhe = partes.join(' · ').slice(0, MAX_DETALHE);
  return [{ title: titulo.slice(0, MAX_TITULO), ...(detalhe ? { detail: detalhe } : {}) }];
}
