import { formatInteger } from './format';

/**
 * Os textos dos componentes do novo plano (prancha Componentes-plano), iguais
 * no PWA e no app. Os componentes só desenham.
 */

// ---------------------------------------------------------------- 1.6 aviso do personal

export type PersonalNoticeInput =
  | { kind: 'workout'; planName: string; from: string; when: string }
  | { kind: 'nutrition-plan'; kcal: number; from: string; when: string }
  | { kind: 'assessment'; due: string }
  | { kind: 'checkin'; questions: number; minutes: number };

export interface PersonalNoticeView {
  title: string;
  detail: string;
  /** O botão: "Ver" no que chegou pronto, o verbo no que pede resposta. */
  action: 'Ver' | 'Registrar' | 'Responder';
  /** Avatar de quem mandou (o nome dá as iniciais) ou o ícone do pedido. */
  lead: { avatar: string } | { icon: 'ruler' | 'review' };
  tone: 'neutral' | 'attention';
}

/**
 * Aviso "recebido do seu personal": aparece no topo do Hoje e da aba do
 * assunto, e some ao aceitar ou responder. "Nova versão" usa o mesmo formato.
 */
export function personalNoticeView(n: PersonalNoticeInput): PersonalNoticeView {
  switch (n.kind) {
    case 'workout':
      return {
        title: `Novo treino: ${n.planName}`,
        detail: `${n.from} · ${n.when}`,
        action: 'Ver',
        lead: { avatar: n.from },
        tone: 'neutral',
      };
    case 'nutrition-plan':
      return {
        title: `Plano alimentar · ${formatInteger(n.kcal)} kcal`,
        detail: `${n.from} · ${n.when}`,
        action: 'Ver',
        lead: { avatar: n.from },
        tone: 'neutral',
      };
    case 'assessment':
      return {
        title: 'Avaliação pedida',
        detail: `Até ${n.due}`,
        action: 'Registrar',
        lead: { icon: 'ruler' },
        tone: 'attention',
      };
    case 'checkin':
      return {
        title: 'Check-in semanal',
        detail: `${n.questions} ${n.questions === 1 ? 'pergunta' : 'perguntas'} · ${n.minutes} min`,
        action: 'Responder',
        lead: { icon: 'review' },
        tone: 'neutral',
      };
  }
}

// ---------------------------------------------------------------- 1.5 folha "Compartilhar"

export type ShareIdentityOption =
  | { as: 'name'; label: string; value: string }
  | { as: 'handle'; label: string; value: string }
  | { as: 'none'; label: string };

/** "Aparecer como": nome de exibição, @ (se a pessoa tem) ou ninguém. */
export function shareIdentityOptions(person: {
  name: string;
  handle: string | null;
}): ShareIdentityOption[] {
  const options: ShareIdentityOption[] = [{ as: 'name', label: person.name, value: person.name }];
  if (person.handle) {
    options.push({ as: 'handle', label: `@${person.handle}`, value: person.handle });
  }
  options.push({ as: 'none', label: 'Ninguém' });
  return options;
}

export const SHARE_TARGETS = [
  { key: 'stories', label: 'Stories', icon: 'camera' },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'whats' },
  { key: 'save', label: 'Salvar', icon: 'download' },
] as const;

export type ShareTarget = (typeof SHARE_TARGETS)[number]['key'];

// ---------------------------------------------------------------- 1.7 "Gerar com IA"

export type AiGenerateState = 'idle' | 'generating' | 'draft' | 'error';

export function aiGenerateLabel(state: AiGenerateState): string {
  if (state === 'generating') return 'Gerando…';
  if (state === 'draft') return 'Gerar de novo';
  return 'Gerar com IA';
}

export const AI_GENERATE_DRAFT_NOTE = 'Rascunho gerado pela IA. Revise antes de publicar.';
export const AI_GENERATE_ERROR = 'Não deu para gerar agora. Tente de novo.';

// ---------------------------------------------------------------- peças dos componentes

/** Texto padrão de cada selo de plano e de estado (prancha Componentes · Selos). */
export const STATUS_BADGE_LABELS = {
  free: 'Free',
  trial: (days: number) => `Teste · ${days} ${days === 1 ? 'dia' : 'dias'}`,
  pro: 'PRO',
  'pro-community': (group: string) => `PRO · ${group}`,
  lite: 'Lite',
  done: 'Concluído',
  pending: 'Pendente',
  risk: 'Em risco',
} as const;

/** Onde a linha com swipe para ao soltar: passou da metade das ações, abre. */
export function swipeSettle(offset: number, actionsWidth: number): number {
  return offset < -actionsWidth / 2 ? -actionsWidth : 0;
}

/** Na régua, o traço `i` é maior (de 5 em 5)? Os traços andam com o valor. */
export function rulerMajorTick(
  i: number,
  r: { value: number; min: number; step: number },
): boolean {
  const offset = Math.round((r.value - r.min) / r.step) % 5;
  return (i + offset) % 5 === 0;
}

export type ShareIdentityChoice =
  { as: 'name'; value: string } | { as: 'handle'; value: string } | { as: 'none' };

/** Como a pessoa aparece no cartão: o nome, o @, ou nada. */
export function shareIdentityText(identity: ShareIdentityChoice): string | null {
  if (identity.as === 'name') return identity.value;
  if (identity.as === 'handle') return `@${identity.value}`;
  return null;
}
