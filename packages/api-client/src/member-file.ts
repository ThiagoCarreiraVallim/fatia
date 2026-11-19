import type { GroupRole } from './community';
import type { ShareScope } from './sharing';

export type MemberPlanStatus = 'PENDING' | 'DECLINED' | 'SCHEDULED' | 'ACTIVE' | 'ENDED';

export interface MemberWorkoutPlan {
  offerId: string;
  title: string;
  status: MemberPlanStatus;
  updatePending: boolean;
  version: number;
  schedule: 'CALENDAR' | 'FLEXIBLE';
  startDate: string | null;
  endDate: string | null;
  weeks: number | null;
  weekNumber: number | null;
  sessionsDone: number | null;
  sessionsPlanned: number | null;
  authorName: string | null;
  canRemove: boolean;
  sentAt: string;
  note: string | null;
  sourceTemplateId: string | null;
  position: number | null;
}

export interface MemberNutritionPlan {
  id: string;
  title: string;
  status: 'SENT' | 'ACCEPTED' | 'SUPERSEDED';
  version: number;
  kcalMin: number;
  kcalMax: number;
  authorName: string | null;
  sentAt: string;
  acceptedAt: string | null;
}

export interface MemberAccessEntry {
  at: string;
  scope: ShareScope;
  action: string;
  denied: boolean;
  professionalName: string | null;
  isMe: boolean;
}

export interface MemberNote {
  id: string;
  text: string;
  authorName: string | null;
  isMine: boolean;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MyMemberNote {
  id: string;
  text: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberAgendaItem {
  kind: 'planned' | 'weighin';
  title: string;
  state: 'planned' | 'done' | 'missed' | 'today' | null;
  weightKg: number | null;
  planOrder: number | null;
}

export interface MemberAgenda {
  today: string;
  from: string;
  to: string;
  timezone: string;
  showsDone: boolean;
  showsWeighins: boolean;
  days: Array<{ date: string; items: MemberAgendaItem[] }>;
}

export interface MemberFile {
  membershipId: string;
  groupId: string;
  name: string;
  role: GroupRole;
  joinedAt: string | null;
  timezone: string;
  proByGroup: boolean;
  followedBy: string[];
  grantedToMe: ShareScope[];
  canSendPlans: boolean;
  canManagePlans: boolean;
  canWriteNotes: boolean;
  plans: {
    workout: MemberWorkoutPlan[];
    nutrition: MemberNutritionPlan[];
    reorderedBySubject: boolean;
  };
  week: {
    workouts: { done: number; target: number } | null;
    nutrition: {
      kcalAvg: number | null;
      daysLogged: number;
      kcalMin: number | null;
      kcalMax: number | null;
      proteinMinG: number | null;
      proteinDays: number | null;
    } | null;
    body: { currentWeightKg: number | null; deltaKg: number; sinceDays: number } | null;
  };
  nextDays: MemberAgenda['days'];
  notes: MemberNote[];
  accessLog: MemberAccessEntry[];
}

export interface SendMemberPlanInput {
  templateId?: string;
  planId?: string;
  schedule: 'CALENDAR' | 'FLEXIBLE';
  startDate?: string;
  weeks?: number;
  weekdays?: number[];
  note?: string;
}

export type FileTabKey =
  'summary' | 'plans' | 'workout' | 'nutrition' | 'photos' | 'body' | 'habits' | 'agenda';

export interface FileTab {
  key: FileTabKey;
  label: string;
  locked: boolean;
}

const todo = (): never => {
  throw new Error('não implementado');
};

export const memberPlanStatus = (_s: MemberPlanStatus): { label: string; tone: string } => todo();
export const memberPlanWhen = (_p: MemberWorkoutPlan): string => todo();
export const memberPlanProgress = (_p: MemberWorkoutPlan, _name: string): string => todo();
export const moveId = (_ids: string[], _id: string, _d: number): string[] => todo();
export const fileTabs = (_granted: ShareScope[]): FileTab[] => todo();
export const lockedCopy = (_name: string, _label: string): { title: string; body: string } =>
  todo();
export const memberWeekCards = (
  _w: MemberFile['week'],
): Array<{ key: string; label: string; value: string; sub: string }> => todo();
export const fileFollowLine = (_f: Pick<MemberFile, 'joinedAt' | 'followedBy'>): string => todo();
export const fileAccessLine = (_e: MemberAccessEntry, _now: Date, _tz: string): string => todo();

export const memberFileApi = {
  file: (_g: string, _m: string): Promise<MemberFile> => todo(),
  agenda: (_g: string, _m: string, _from?: string, _to?: string): Promise<MemberAgenda> => todo(),
  sendPlan: (_g: string, _m: string, _input: SendMemberPlanInput) => todo(),
  removePlan: (_g: string, _m: string, _o: string, _opts: { notify: boolean; endToday: boolean }) =>
    todo(),
  reorderPlans: (_g: string, _m: string, _ids: string[]) => todo(),
  createNote: (_g: string, _m: string, _t: string): Promise<MemberNote> => todo(),
  updateNote: (_g: string, _m: string, _n: string, _t: string): Promise<MemberNote> => todo(),
  removeNote: (_g: string, _m: string, _n: string) => todo(),
};
export const myNotesApi = { list: (_g: string): Promise<MyMemberNote[]> => todo() };
export const planOrderApi = {
  get: (): Promise<{ planIds: string[]; customized: boolean }> => todo(),
  set: (_ids: string[]): Promise<{ planIds: string[]; customized: boolean }> => todo(),
};
