import { GroupKind, GroupType, SetupStep } from '@fatia/db';

/**
 * O checklist de primeiros passos do dono (#372, Onb-C3 e Onb-Criador-Web).
 * Função pura: os fatos vêm do service, a regra fica aqui.
 *
 * Os 9 itens seguem o canvas, na ordem da prancha web. "Criar" é feito por
 * existir; "Marca" bloqueia o painel até ser salva (passo 2 do onboarding). Os
 * outros se marcam sozinhos quando o dado mostra a ação (convite enviado,
 * desafio marcado, plano publicado, equipamento salvo), quando o dono salva a
 * configuração correspondente, ou à mão. "Equipamentos" só aparece na academia.
 */
export const SETUP_ITEMS = [
  'CREATE',
  'BRAND',
  'CATEGORIES',
  'TEAM',
  'MEMBERS',
  'CHALLENGE',
  'PLAN',
  'EQUIPMENT',
  'ACCESS',
] as const;
export type SetupItemKey = (typeof SETUP_ITEMS)[number];

/** O que o dono marca e desmarca à mão. "Criar" e "Marca" nunca. */
export const MANUAL_SETUP_STEPS: readonly SetupStep[] = [
  SetupStep.CATEGORIES,
  SetupStep.TEAM,
  SetupStep.MEMBERS,
  SetupStep.CHALLENGE,
  SetupStep.PLAN,
  SetupStep.EQUIPMENT,
  SetupStep.ACCESS,
];

/** O que o banco já mostra, sem olhar o que foi marcado. */
export interface SetupFacts {
  type: GroupType;
  kind: GroupKind | null;
  /** Cor, capa ou logo salvos. */
  brand: boolean;
  /** Alguma categoria obrigatória marcada. */
  requiredScopes: boolean;
  /** Convite de equipe enviado, ou alguém da equipe além do dono. */
  team: boolean;
  /** Convite de membro (link, QR, e-mail ou código), ou um membro ativo. */
  members: boolean;
  challenge: boolean;
  /** Plano publicado ou dica publicada. */
  plan: boolean;
  equipment: boolean;
}

export interface SetupItemState {
  key: SetupItemKey;
  done: boolean;
  /** Feito pelo dado: não tem "Desfazer". */
  auto: boolean;
}

export interface SetupState {
  kind: GroupKind | null;
  items: SetupItemState[];
  done: number;
  total: number;
  complete: boolean;
  /** O checklist aparece no topo do painel. */
  visible: boolean;
  /** A marca (passo 2) ainda não foi salva: o painel abre a tela da marca. */
  brandPending: boolean;
}

/** Academia: patrocinada que não é personal. As patrocinadas antigas, sem tipo, contam como academia. */
export function isGym(type: GroupType, kind: GroupKind | null): boolean {
  return type === GroupType.SPONSORED && kind !== GroupKind.COACH;
}

export function setupItemKeys(type: GroupType, kind: GroupKind | null): SetupItemKey[] {
  return SETUP_ITEMS.filter((k) => k !== 'EQUIPMENT' || isGym(type, kind));
}

function autoDone(key: SetupItemKey, f: SetupFacts): boolean {
  switch (key) {
    case 'CREATE':
      return true;
    case 'BRAND':
      return f.brand;
    case 'CATEGORIES':
      return f.requiredScopes;
    case 'TEAM':
      return f.team;
    case 'MEMBERS':
      return f.members;
    case 'CHALLENGE':
      return f.challenge;
    case 'PLAN':
      return f.plan;
    case 'EQUIPMENT':
      return f.equipment;
    case 'ACCESS':
      return false;
  }
}

export function computeSetup(
  facts: SetupFacts,
  saved: readonly SetupStep[],
  hiddenAt: Date | null,
  repeatedAt: Date | null,
): SetupState {
  const marcados = new Set<string>(saved);
  const items = setupItemKeys(facts.type, facts.kind).map((key) => {
    const auto = autoDone(key, facts);
    return { key, auto, done: auto || marcados.has(key) };
  });
  const done = items.filter((i) => i.done).length;
  const complete = done === items.length;
  const brand = items.find((i) => i.key === 'BRAND')!;
  return {
    kind: facts.kind,
    items,
    done,
    total: items.length,
    complete,
    visible: hiddenAt === null && (!complete || repeatedAt !== null),
    brandPending: !brand.done,
  };
}

/**
 * Salvar a configuração conta como a ação do passo (#372): o dono decidiu, mesmo
 * que tenha deixado como estava. Categorias, acesso e a cor da marca.
 */
export function stepsFromSettings(input: {
  requiredSharingScopes?: unknown;
  joinPolicy?: unknown;
  visibility?: unknown;
  postPolicy?: unknown;
  brandColor?: string | null;
}): SetupStep[] {
  const out: SetupStep[] = [];
  if (input.brandColor) out.push(SetupStep.BRAND);
  if (input.requiredSharingScopes !== undefined) out.push(SetupStep.CATEGORIES);
  if (
    input.joinPolicy !== undefined ||
    input.visibility !== undefined ||
    input.postPolicy !== undefined
  ) {
    out.push(SetupStep.ACCESS);
  }
  return out;
}

/**
 * O endereço `fat.ia.br/<slug>` a partir do nome (Onb-C1): minúsculas, sem
 * acento, sem símbolo. Curto demais para o formato (mínimo 3), ganha
 * "-comunidade". Mesma regra de `communitySlug` no `@fatia/api-client`.
 */
export const SLUG_MAX = 40;

export function communitySlug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
  if (!base) return 'comunidade';
  return base.length < 3 ? `${base}-comunidade` : base;
}
