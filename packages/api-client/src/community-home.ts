import type { AccessLogEntry, GroupRole, JoinPolicy, MyGroup, TeamMemberView } from './community';
import { SHARE_SCOPE_LABEL } from './sharing';

/**
 * Textos e regras das telas de comunidade do membro (#393): Minhas comunidades
 * (Cm-01), Entrar com QR ou código (Cm-02) e Sobre (Cm-04). Iguais na web e
 * no app; quem decide o que cada um vê é a API.
 */

// ---------------------------------------------------------------- Cm-02

/** O que a pessoa leu ou digitou: um código (legível ou slug) ou o token de um convite. */
export type CommunityEntry = { kind: 'code'; code: string } | { kind: 'invite'; token: string };

const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const CODE = /^[A-Za-z0-9_-]{3,60}$/;

/**
 * O código do QR da recepção ou do campo "Código ou link". O QR traz o link
 * `…/community?join=1&code=XXXX`; o cartaz antigo, o slug; o convite, o link
 * `…/c/<token>` — que entra pelo caminho do convite (é aprovação). Fora disso,
 * `null`, e a tela diz "Peça um novo à equipe".
 */
export function parseCommunityEntry(raw: string): CommunityEntry | null {
  const text = raw.trim();
  if (!text) return null;
  // Digitado da parede ("AD7K 3Q9P"): sem barra nem dois-pontos, o espaço não conta.
  if (!/[/:]/.test(text)) {
    const compact = text.replace(/\s+/g, '');
    // Código primeiro; só o tamanho exato do token (43) é convite.
    if (compact.length !== 43 && CODE.test(compact)) return { kind: 'code', code: compact };
    if (INVITE_TOKEN.test(compact)) return { kind: 'invite', token: compact };
    return null;
  }
  const convite = /(?:^|\/)c\/([^/?#]+)\/?(?:[?#].*)?$/.exec(text);
  if (convite && INVITE_TOKEN.test(convite[1])) return { kind: 'invite', token: convite[1] };
  try {
    const url = new URL(text);
    const param = url.searchParams.get('code') ?? url.searchParams.get('codigo');
    const candidate = param ?? url.pathname.split('/').filter(Boolean).pop() ?? '';
    return CODE.test(candidate) ? { kind: 'code', code: candidate } : null;
  } catch {
    return null;
  }
}

/** "Código ou link inválido. Peça um novo à equipe." — o mesmo para inválido, vencido e revogado. */
export const ENTRY_INVALID = 'Código ou link inválido. Peça um novo à equipe.';

export interface EntryPolicyView {
  badge: string;
  tone: 'ok' | 'warn' | 'muted';
  text: string;
  cta: string;
}

/** A forma de entrada no cartão da comunidade encontrada. */
export function entryPolicyView(policy: JoinPolicy): EntryPolicyView {
  switch (policy) {
    case 'OPEN':
      return { badge: 'aberta', tone: 'ok', text: 'Entra na hora', cta: 'Entrar' };
    case 'APPROVAL':
      return {
        badge: 'com aprovação',
        tone: 'warn',
        text: 'O dono aprova seu pedido',
        cta: 'Pedir para entrar',
      };
    default:
      return { badge: 'por convite', tone: 'muted', text: 'Entra pelo convite', cta: 'Entrar' };
  }
}

/**
 * Quem já está na comunidade (ativo ou com pedido esperando) não refaz o pedido:
 * o cartão do Cm-02 avisa e o botão leva até ela. Sem isso, a pessoa escolhia o
 * que compartilhar e só então tomava o 409. `null` = segue o fluxo de entrada.
 */
export function alreadyInView(
  mine: readonly Pick<MyGroup, 'id' | 'status'>[] | undefined,
  groupId: string,
): EntryPolicyView | null {
  const m = mine?.find((g) => g.id === groupId);
  if (m?.status === 'ACTIVE') {
    return {
      badge: 'você é membro',
      tone: 'ok',
      text: 'Você já faz parte desta comunidade',
      cta: 'Abrir a comunidade',
    };
  }
  if (m?.status === 'INVITED') {
    return {
      badge: 'aguardando aprovação',
      tone: 'warn',
      text: 'Seu pedido já está com o dono',
      cta: 'Ver o pedido',
    };
  }
  return null;
}

/** O PRO que a comunidade oferece a quem entra (`GroupPreview.proOffer`). */
export type ProOffer = 'ALL_MEMBERS' | 'SEATS' | null;

/** Todos os membros: libera. Por assento: só pode liberar (a equipe distribui). */
export function proOfferNote(offer: ProOffer): string | null {
  if (offer === 'ALL_MEMBERS') return 'A academia libera o PRO para todos os membros.';
  if (offer === 'SEATS') return 'A academia pode liberar o PRO: a equipe distribui os assentos.';
  return null;
}
export const CAMERA_NOTE =
  'Na primeira vez, o celular pede acesso à câmera. A imagem não sai do aparelho: o app só lê o código.';

// ---------------------------------------------------------------- Cm-01

const TYPE_WORD = { SPONSORED: 'patrocinada', SOCIAL: 'social' } as const;
const ROLE_WORD: Record<GroupRole, string> = {
  OWNER: 'dono',
  PROFESSIONAL: 'profissional',
  CREATOR: 'criador',
  MEMBER: 'membro',
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "patrocinada · membro · 124 pessoas". */
export function communityCardMeta(
  g: Pick<MyGroup, 'type' | 'role' | 'status' | 'memberCount'>,
): string {
  if (g.status === 'INVITED') return `${TYPE_WORD[g.type]} · aguardando aprovação`;
  return `${TYPE_WORD[g.type]} · ${ROLE_WORD[g.role]} · ${plural(g.memberCount, 'pessoa', 'pessoas')}`;
}

export interface CommunityBadge {
  label: string;
  tone: 'team' | 'muted' | 'ok';
}

/** Os selos do cartão: o que espera a pessoa, posts novos, posição no desafio, pública. */
export function communityCardBadges(
  g: Pick<MyGroup, 'forYouCount' | 'newPostCount' | 'challenge' | 'visibility' | 'status'>,
): CommunityBadge[] {
  if (g.status !== 'ACTIVE') return [];
  const out: CommunityBadge[] = [];
  if (g.forYouCount > 0) out.push({ label: `${g.forYouCount} para você`, tone: 'team' });
  if (g.newPostCount > 0) {
    out.push({ label: plural(g.newPostCount, 'post novo', 'posts novos'), tone: 'muted' });
  }
  if (g.challenge) out.push({ label: `desafio · ${g.challenge.rank}º`, tone: 'ok' });
  if (g.visibility === 'PUBLIC') out.push({ label: 'pública', tone: 'muted' });
  return out;
}

/** O selo do topo do cartão: só com o PRO pago pela comunidade valendo agora. */
export const PRO_PAID_BADGE = 'PRO pago pela academia';

// ---------------------------------------------------------------- Cm-04

/** Algumas cidades com acento: o IANA escreve sem. */
const CIDADES: Record<string, string> = {
  Sao_Paulo: 'São Paulo',
  Cuiaba: 'Cuiabá',
  Belem: 'Belém',
  Maceio: 'Maceió',
  Araguaina: 'Araguaína',
};

/** "fuso Cuiabá". */
export function timezoneLabel(tz: string): string {
  const cidade = tz.split('/').pop() ?? tz;
  return `fuso ${CIDADES[cidade] ?? cidade.replace(/_/g, ' ')}`;
}

export const VISIBILITY_WORD = { PUBLIC: 'pública', PRIVATE: 'privada' } as const;

export function myRoleBadge(role: GroupRole): string {
  return role === 'MEMBER' ? 'você é membro' : `você é ${ROLE_WORD[role]}`;
}

export interface TeamSection {
  title: string;
  members: TeamMemberView[];
}

const SECTION_TITLE: Partial<Record<GroupRole, string>> = {
  OWNER: 'Donos',
  PROFESSIONAL: 'Profissionais',
  CREATOR: 'Criadores de conteúdo',
};

/** A equipe por papel, na ordem dono → profissional → criador. */
export function teamSections(team: readonly TeamMemberView[]): TeamSection[] {
  return (['OWNER', 'PROFESSIONAL', 'CREATOR'] as const)
    .map((role) => ({
      title: SECTION_TITLE[role]!,
      members: team.filter((m) => m.role === role),
    }))
    .filter((s) => s.members.length > 0);
}

/** Quantos da equipe veem algo do que a pessoa compartilha. */
export function teamWhoSeesCount(team: readonly TeamMemberView[]): number {
  return team.filter((m) => m.sees.length > 0).length;
}

const dayIn = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, dateStyle: 'short' }).format(d);

/** O selo "viu hoje": o último acesso foi hoje, no fuso de quem olha a tela. */
export function viewedToday(at: string | null, now: Date, tz: string): boolean {
  return at !== null && dayIn(new Date(at), tz) === dayIn(now, tz);
}

/** "hoje 09:12", "ontem 18:40" ou "seg 18:40" (até uma semana), senão "12/11 18:40". */
export function relativeStamp(at: Date, now: Date, tz: string): string {
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
  const dias = Math.round((Date.parse(dayIn(now, tz)) - Date.parse(dayIn(at, tz))) / 86_400_000);
  if (dias === 0) return `hoje ${hora}`;
  if (dias === 1) return `ontem ${hora}`;
  if (dias > 1 && dias < 7) {
    const semana = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'short' })
      .format(at)
      .replace('.', '');
    return `${semana} ${hora}`;
  }
  const dia = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
  }).format(at);
  return `${dia} ${hora}`;
}

/** "Helena Prado abriu Treino · hoje 09:12" / "… tentou ver Alimentação · negado · seg 18:40". */
export function accessLogLine(entry: AccessLogEntry, now: Date, tz: string): string {
  const quem = entry.professionalName ?? 'Alguém que saiu do Fatia';
  const quando = relativeStamp(new Date(entry.at), now, tz);
  if (entry.scope === null) return `${quem} abriu sua ficha · ${quando}`;
  const area = SHARE_SCOPE_LABEL[entry.scope];
  return entry.denied
    ? `${quem} tentou ver ${area} · negado · ${quando}`
    : `${quem} abriu ${area} · ${quando}`;
}

export const LEAVE_COPY = {
  body: 'A equipe perde o acesso ao que você compartilhava. Seus registros continuam com você.',
  bodyPro:
    'A equipe perde o acesso ao que você compartilhava e o PRO pago pela academia acaba. Seus registros continuam com você.',
} as const;

export const PRO_PAID_NOTE = 'A academia paga seu PRO. Se sair, volta ao Free sem perder nada.';

/**
 * O pedido de abrir a folha "Tenho código" que veio na navegação
 * (`/community?join=1&code=…`). A aba fica montada, então cada `key` nova é um
 * pedido novo; `null` = a navegação não pediu nada.
 */
export function joinSheetRequest(params: {
  join?: string;
  code?: string;
}): { key: string; code: string | null } | null {
  const code = params.code?.trim() || null;
  if (params.join !== '1' && !code) return null;
  return { key: `${params.join ?? ''}|${code ?? ''}`, code };
}

/** O código a procurar sozinho agora: o que veio no link, se ainda não foi procurado. */
export function autoLookCode(s: {
  open: boolean;
  initialCode: string | null | undefined;
  lookedFor: string | null;
}): string | null {
  if (!s.open || !s.initialCode || s.initialCode === s.lookedFor) return null;
  return s.initialCode;
}
