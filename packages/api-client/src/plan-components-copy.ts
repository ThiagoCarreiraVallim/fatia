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
