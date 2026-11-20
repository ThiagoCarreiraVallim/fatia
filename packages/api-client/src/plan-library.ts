import type { PlanTemplate, TemplateKind } from './community-content';
import type { ChipTone } from './seats-panel';

/** Esqueleto (#405): a implementação vem depois dos testes. */

export interface TemplateReach {
  band: 'none' | 'few' | 'many';
  count: number | null;
}

export type LibraryFilter = 'all' | 'community' | 'team' | 'drafts';

export interface SendRecipient {
  membershipId: string;
  name: string;
  accompaniedByMe: boolean;
  hasPlan: boolean;
  alreadyHas: boolean;
}

export type SendStart = 'TODAY' | 'AFTER_CURRENT' | 'DATE';
export type SendKind = 'WORKOUT' | 'NUTRITION' | 'HABIT' | 'QUESTIONNAIRE' | 'RECOMMENDATION';

export interface SendPlansInput {
  templateId: string;
  membershipIds: string[];
  schedule?: 'CALENDAR' | 'FLEXIBLE';
  start?: SendStart;
  startDate?: string;
  weeks?: number;
  weekdays?: number[];
  endDate?: string;
  note?: string;
  changeNote?: string;
}

export interface SendResult {
  results: Array<{ membershipId: string; id: string; version: number; kind: 'new' | 'update' }>;
}

export type SentStatus = 'SENT' | 'ACCEPTED' | 'DECLINED' | 'SUPERSEDED' | 'REVOKED' | 'ENDED';

export interface SentItem {
  id: string;
  kind: 'WORKOUT' | 'NUTRITION';
  title: string;
  version: number;
  changeNote: string | null;
  name: string;
  membershipId: string | null;
  sentAt: string;
  status: SentStatus;
  schedule: 'CALENDAR' | 'FLEXIBLE' | null;
  startDate: string | null;
  endDate: string | null;
  progress: { done: number; planned: number | null; percent: number | null } | null;
  noProgress: boolean;
  canRevoke: boolean;
}

const nope = (): never => {
  throw new Error('não implementado');
};

export const sendsApi = {
  recipients: (_groupId: string, _templateId?: string): Promise<{ recipients: SendRecipient[] }> =>
    nope(),
  list: (_groupId: string): Promise<{ items: SentItem[] }> => nope(),
  send: (_groupId: string, _input: SendPlansInput): Promise<SendResult> => nope(),
  revoke: (_groupId: string, _id: string): Promise<{ id: string; status: 'REVOKED' }> => nope(),
};

export const SEND_KINDS: Array<{ key: SendKind; label: string; enabled: boolean; soon?: string }> =
  [];

export const withWhomLabel = (_r: TemplateReach | undefined): string => nope();
export const communityToggleLabel = (
  _t: PlanTemplate,
): { label: string; hint: string; disabled: boolean } => nope();
export const filterLibrary = (
  _l: PlanTemplate[],
  _f: { kind: TemplateKind; filter: LibraryFilter; query?: string; author?: string | null },
): PlanTemplate[] => nope();
export const libraryCounts = (_l: PlanTemplate[]): Record<TemplateKind, number> => nope();
export const libraryAuthors = (_l: PlanTemplate[]): string[] => nope();
export const libraryFormat = (_t: PlanTemplate): string => nope();
export const canSendTemplate = (_t: PlanTemplate): boolean => nope();
export const sendButtonLabel = (_names: string[]): string => nope();
export const recipientFilters = (
  _r: SendRecipient[],
): Array<{ key: 'all' | 'mine' | 'noPlan'; label: string; count: number; ids: string[] }> => nope();
export const validateSendForm = (_f: {
  kind: TemplateKind;
  templateId: string | null;
  membershipIds: string[];
  schedule: 'CALENDAR' | 'FLEXIBLE';
  start: SendStart;
  startDate?: string | null;
  weeks?: number | null;
  weekdays: number[];
}): string | null => nope();
export const sendPreview = (_p: {
  kind: TemplateKind;
  title: string;
  changeNote: string | null;
}): { eyebrow: string; title: string; body: string; button: string } => nope();
export const sendSuccessToast = (_r: SendResult): string => nope();
export const sentStatus = (_s: SentStatus): { label: string; tone: ChipTone } => nope();
export const sentLine = (_i: SentItem): string => nope();
export const sentProgressLine = (_i: SentItem): string | null => nope();
