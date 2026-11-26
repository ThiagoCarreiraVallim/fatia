import { panelHref } from './community-panel';
import { formatDecimal, formatInteger, formatVolume } from './format';
import { apiFetch } from './http';

/**
 * A comunidade de demonstração e os primeiros passos (#412, Pn-21 a Pn-21d):
 * os tipos, as rotas e os textos iguais na web e no app.
 *
 * A demo é uma comunidade de verdade no banco, marcada como demo, com uma
 * aluna fictícia (a Ana Exemplo). Ela não aparece na lista de comunidades,
 * não convida, não cobra e não avisa ninguém; a API é quem barra.
 */

export interface DemoSummary {
  groupId: string;
  name: string;
  brandColor: string;
  createdAt: string;
  student: { userId: string; membershipId: string; name: string; joinedAt: string | null };
  plan: {
    title: string;
    weekNumber: number;
    weeks: number;
    sessionsDone: number;
    sessionsPlanned: number;
  } | null;
  weight: { kg: number; loggedAt: string; deltaKg: number | null } | null;
  today: { kcal: number; kcalGoal: number | null; waterMl: number; waterGoalMl: number };
  challenge: { id: string; title: string } | null;
}

export interface DemoState {
  demo: DemoSummary | null;
  /** Quem é dona de uma comunidade de verdade cria a demo. */
  canCreate: boolean;
  /** A comunidade de verdade para onde "Sair da demo" volta. */
  homeGroupId: string | null;
}

/** "Primeiros passos": o critério provisório de comunidade ativa (troca na #372). */
export interface FirstSteps {
  active: boolean;
  activeMembers: number;
  threshold: number;
}

export interface DemoSession {
  token: string;
  expiresAt: string;
}

const base = '/api/groups';

export const demoApi = {
  get: () => apiFetch<DemoState>(`${base}/demo`),
  create: () => apiFetch<DemoState>(`${base}/demo`, { method: 'POST' }),
  remove: () => apiFetch<{ removed: boolean }>(`${base}/demo`, { method: 'DELETE' }),
  openSession: () => apiFetch<DemoSession>(`${base}/demo/session`, { method: 'POST' }),
  firstSteps: (groupId: string) => apiFetch<FirstSteps>(`${base}/${groupId}/first-steps`),
};

// ---------------------------------------------------------------- textos

/** O item do menu: "Demonstração" até a comunidade ficar ativa; depois, "Primeiros passos". */
export function demoMenuLabel(firstSteps: Pick<FirstSteps, 'active'> | null | undefined): string {
  return firstSteps?.active ? 'Primeiros passos' : 'Demonstração';
}

/** Os três avisos embaixo do cartão (Pn-21). */
export const DEMO_NOTICES: readonly { title: string; body: string }[] = [
  {
    title: 'Separada da sua comunidade',
    body: 'A demo tem outro nome e outra cor. Nenhum membro seu vê.',
  },
  {
    title: 'Pode mexer à vontade',
    body: 'Envie plano, publique, comente. Nada é enviado para ninguém.',
  },
  {
    title: 'Apague quando quiser',
    body: 'Some do menu. Dá para criar de novo em Configurações.',
  },
];

export const DEMO_INTRO =
  'Uma comunidade pronta, com 1 aluna fictícia, plano, treinos, peso e desafio. Leva 1 minuto para ver tudo.';

export interface DemoCard {
  key: 'student' | 'plan' | 'weight' | 'challenge';
  icon: string;
  title: string;
  sub: string;
}

/** Peso com sinal de verdade: "−2,5 kg". */
function signedKg(delta: number): string {
  const n = formatDecimal(Math.abs(delta));
  return `${delta < 0 ? '−' : delta > 0 ? '+' : ''}${n} kg`;
}

/** Os quatro cartões do Pn-21 (o que já está pronto na demo). */
export function demoCards(d: DemoSummary): DemoCard[] {
  const cards: DemoCard[] = [
    { key: 'student', icon: 'users', title: d.student.name, sub: 'aluna fictícia, já preenchida' },
  ];
  if (d.plan) {
    cards.push({
      key: 'plan',
      icon: 'dumbbell',
      title: d.plan.title,
      sub: `semana ${d.plan.weekNumber} de ${d.plan.weeks} · ${d.plan.sessionsDone} de ${d.plan.sessionsPlanned} sessões`,
    });
  }
  if (d.weight) {
    cards.push({
      key: 'weight',
      icon: 'ruler',
      title: `${formatDecimal(d.weight.kg)} kg`,
      sub: d.weight.deltaKg !== null ? `${signedKg(d.weight.deltaKg)} em 30 dias` : 'peso de hoje',
    });
  }
  if (d.challenge) {
    cards.push({
      key: 'challenge',
      icon: 'trophy',
      title: d.challenge.title,
      sub: 'desafio em andamento',
    });
  }
  return cards;
}

export interface DemoStat {
  key: 'workouts' | 'kcal' | 'weight' | 'water';
  label: string;
  value: string;
  sub: string;
}

/**
 * Os quatro números da Ana dentro da demo (Pn-21b). O quarto é Água, não
 * Hábitos: o Fatia ainda não tem hábitos (#390).
 */
export function demoStats(d: DemoSummary): DemoStat[] {
  return [
    {
      key: 'workouts',
      label: 'Treinos',
      value: d.plan ? formatInteger(d.plan.sessionsDone) : '0',
      sub: d.plan ? `de ${d.plan.sessionsPlanned} no plano` : 'sem plano',
    },
    {
      key: 'kcal',
      label: 'Kcal hoje',
      value: formatInteger(d.today.kcal),
      sub: d.today.kcalGoal ? `meta de ${formatInteger(d.today.kcalGoal)}` : 'sem meta',
    },
    {
      key: 'weight',
      label: 'Peso',
      value: d.weight ? `${formatDecimal(d.weight.kg)} kg` : '—',
      sub:
        d.weight?.deltaKg !== null && d.weight?.deltaKg !== undefined
          ? `${signedKg(d.weight.deltaKg)} em 30 dias`
          : 'sem pesagem',
    },
    {
      key: 'water',
      label: 'Água',
      value: formatVolume(d.today.waterMl),
      sub: `de ${formatVolume(d.today.waterGoalMl)} hoje`,
    },
  ];
}

/** "aluna fictícia · entrou há 14 dias · compartilha Treino, Alimentação e Corpo". */
export function demoStudentLine(d: DemoSummary, now: Date = new Date()): string {
  const joined = d.student.joinedAt ? new Date(d.student.joinedAt) : null;
  const dias = joined
    ? Math.max(0, Math.round((now.getTime() - joined.getTime()) / 86_400_000))
    : null;
  const entrou =
    dias === null
      ? null
      : dias === 0
        ? 'entrou hoje'
        : dias === 1
          ? 'entrou ontem'
          : `entrou há ${dias} dias`;
  return ['aluna fictícia', entrou, 'compartilha Treino, Alimentação e Corpo']
    .filter(Boolean)
    .join(' · ');
}

/** A regra dos 5: número de grupo com menos gente não aparece, nem na demo. */
export const SMALL_SAMPLE_LABEL = 'amostra pequena demais para mostrar';

export const DEMO_GROUP_NUMBERS: readonly string[] = [
  'Ativos em 7 dias',
  'Ativação por origem',
  'Resultado da enquete',
];

export const DEMO_SAMPLE_NOTE =
  'A demo tem 1 aluna. Números de grupo só aparecem com 5 pessoas ou mais, como na sua comunidade.';

export interface DemoShortcut {
  key: 'send' | 'file' | 'review' | 'announce';
  icon: string;
  label: string;
  href: string;
}

/** "Experimente" (Pn-21b): atalhos para as telas de verdade, dentro da demo. */
export function demoShortcuts(d: Pick<DemoSummary, 'groupId' | 'student'>): DemoShortcut[] {
  const first = d.student.name.split(' ')[0];
  return [
    {
      key: 'send',
      icon: 'send',
      label: `Enviar um plano para a ${first}`,
      href: `${panelHref(d.groupId, 'send')}?membro=${d.student.membershipId}`,
    },
    {
      key: 'file',
      icon: 'ruler',
      label: `Abrir a ficha da ${first}`,
      href: `${panelHref(d.groupId, 'members')}/${d.student.membershipId}`,
    },
    {
      key: 'review',
      icon: 'review',
      label: 'Revisar os treinos da semana',
      href: panelHref(d.groupId, 'review'),
    },
    {
      key: 'announce',
      icon: 'mega',
      label: 'Postar um aviso no mural',
      href: panelHref(d.groupId, 'announcements'),
    },
  ];
}

export const DEMO_BANNER_TITLE = 'Demonstração · dados fictícios';

export function demoBannerText(homeName: string | null): string {
  return homeName
    ? `Nada do que você fizer aqui aparece na ${homeName}.`
    : 'Nada do que você fizer aqui aparece na sua comunidade.';
}

/** "Demo apagada" (Pn-21c). */
export function demoRemovedText(homeName: string | null): string {
  const real = homeName ? `Nada da ${homeName} foi mexido.` : 'Nada da sua comunidade foi mexido.';
  return `A Academia Exemplo e a Ana Exemplo saíram do menu. ${real}`;
}

/** "Primeiros passos" (Pn-21d): o resumo da comunidade ativa. */
export function firstStepsSummary(
  fs: FirstSteps,
  groupName: string,
): {
  title: string;
  sub: string;
} {
  const membros = fs.activeMembers === 1 ? '1 membro ativo' : `${fs.activeMembers} membros ativos`;
  return fs.active
    ? { title: `${groupName} está ativa`, sub: membros }
    : {
        title: `${groupName} está começando`,
        sub: `${membros} · ativa a partir de ${fs.threshold}`,
      };
}

// ---------------------------------------------------------------- sessão do app

/** O caminho do app que abre a sessão de demonstração (`/demo/<token>`). */
export function demoSessionPath(token: string): string {
  return `/demo/${encodeURIComponent(token)}`;
}

/** "vale por 30 min" a partir do vencimento. */
export function demoSessionExpiry(expiresAt: string, now: Date = new Date()): string {
  const min = Math.max(0, Math.round((new Date(expiresAt).getTime() - now.getTime()) / 60_000));
  return min <= 1 ? 'vale por menos de 1 min' : `vale por ${min} min`;
}

export const DEMO_SESSION_HINT =
  'Abra no celular com o Fatia instalado. É só leitura: nada é gravado, a IA fica de fora e ninguém recebe aviso.';

/** O token da sessão de demo: o mesmo formato que a API emite (`fatia_demo_` + base62). */
const DEMO_SESSION_TOKEN = /^fatia_demo_[A-Za-z0-9]{16,64}$/;

/**
 * O que a sessão de demo lê: o Hoje da Ana e nada mais. A API confere de novo
 * (o token só vale em rota `@DemoReadable`); aqui o cliente nem tenta o resto.
 */
export const DEMO_SESSION_ROUTES: readonly string[] = ['dashboard/today', 'users/me'];

export function isDemoSessionToken(value: string | null | undefined): value is string {
  return typeof value === 'string' && DEMO_SESSION_TOKEN.test(value);
}

/** O token de `https://…/demo/<t>`, `fatia://demo/<t>` ou `/demo/<t>`; senão `null`. */
export function demoTokenFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /(?:^|\/)demo\/([^/?#]+)\/?(?:[?#].*)?$/.exec(url);
  const token = match?.[1] ? decodeURIComponent(match[1]) : null;
  return isDemoSessionToken(token) ? token : null;
}

/**
 * O pedido da sessão de demo direto à API (o app não tem o proxy do Next):
 * só GET, só as rotas do Hoje, e o token curto como Bearer, nunca a sessão de
 * quem abriu. `null` quando a rota ou o token não servem.
 */
export function demoSessionRequest(
  apiBase: string,
  token: string,
  route: string,
): { url: string; init: { method: 'GET'; headers: Record<string, string> } } | null {
  if (!DEMO_SESSION_ROUTES.includes(route) || !isDemoSessionToken(token)) return null;
  return {
    url: `${apiBase.replace(/\/+$/, '')}/api/${route}`,
    init: {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    },
  };
}
