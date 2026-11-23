import type { GroupRole, GroupType, JoinPolicy } from './community';
import type { ShareScope } from './sharing';
import type { TemplateKind, TipCategory } from './community-content';

export type CommunitySection =
  'NUTRITION_TIPS' | 'NUTRITION_PLANS' | 'CHALLENGES' | 'FEED' | 'AGENDA';

export interface CommunitySectionInfo {
  key: CommunitySection;
  label: string;
  sub: string;
  icon: string;
}

export const COMMUNITY_SECTIONS: readonly CommunitySectionInfo[] = [];
export const GROUP_TYPE_OPTIONS: readonly { value: GroupType; label: string }[] = [];
export const VISIBILITY_OPTIONS: readonly { value: 'PUBLIC' | 'PRIVATE'; label: string }[] = [];
export const JOIN_POLICY_OPTIONS: readonly { value: JoinPolicy; label: string; hint: string }[] =
  [];
export const REQUIRED_SCOPE_ITEMS: readonly {
  scope: ShareScope;
  label: string;
  sub: string;
  locked: boolean;
}[] = [];
export const MEAL_PHOTOS_LOCKED = '';

export function isSectionHidden(
  _group: { hiddenSections?: CommunitySection[] },
  _section: CommunitySection,
): boolean {
  throw new Error('a fazer');
}
export function toggleSection(_h: CommunitySection[], _s: CommunitySection): CommunitySection[] {
  throw new Error('a fazer');
}
export function sectionSubtitle(_s: CommunitySection, _hidden: boolean): string {
  throw new Error('a fazer');
}
export function sectionToast(_s: CommunitySection, _hidden: boolean): string {
  throw new Error('a fazer');
}
export function visibleCommunityTips<T extends { category: TipCategory }>(
  _tips: T[],
  _hidden: CommunitySection[] | undefined,
): T[] {
  throw new Error('a fazer');
}
export function visibleCommunityPlans<T extends { kind: TemplateKind }>(
  _plans: T[],
  _hidden: CommunitySection[] | undefined,
): T[] {
  throw new Error('a fazer');
}
export function teamSummaryLabel(_c: Partial<Record<GroupRole, number>>): string {
  throw new Error('a fazer');
}
