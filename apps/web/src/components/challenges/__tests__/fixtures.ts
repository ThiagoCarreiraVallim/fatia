import type {
  ActivityItem,
  Challenge,
  ChallengeDetail,
  ChallengeRules,
  MyParticipation,
  CheckinReviewItem,
} from '@fatia/api-client';

/** Fábricas dos testes de desafio (membro e painel). */

export const rules = (p: Partial<ChallengeRules> = {}): ChallengeRules => ({
  waterGoalMl: null,
  stepsGoal: null,
  dailyCap: null,
  allowedStepSources: [],
  pointsTable: null,
  maxPointsPerDay: null,
  checkin: null,
  ...p,
});

export const me = (p: Partial<MyParticipation> = {}): MyParticipation => ({
  displayName: 'Ana',
  score: 3,
  rank: 2,
  medal: null,
  streak: 2,
  pendingReview: 0,
  ...p,
});

export const challenge = (p: Partial<Challenge> = {}): Challenge => ({
  id: 'c1',
  title: 'Outubro ativo',
  description: null,
  kind: 'METRIC',
  metric: 'ACTIVE_DAYS',
  startDate: '2026-10-12',
  endDate: '2026-10-18',
  totalDays: 7,
  status: 'running',
  endedEarly: false,
  resultPending: false,
  participants: 2,
  rules: rules(),
  needsPhotoConsent: false,
  watching: false,
  canManage: false,
  canReview: false,
  me: null,
  ...p,
});

export const detail = (p: Partial<ChallengeDetail> = {}): ChallengeDetail => ({
  ...challenge(p),
  leaderboard: [],
  suggestedDisplayName: 'Ana',
  today: null,
  activity: [],
  ...p,
});

export const activity = (p: Partial<ActivityItem> = {}): ActivityItem => ({
  id: 'a1',
  type: 'checkin',
  displayName: 'Bia',
  isMe: false,
  date: '2026-10-15',
  at: '2026-10-15T21:54:00.000Z',
  points: 1,
  parts: ['workout'],
  status: 'valid',
  reason: null,
  photoUrl: null,
  canFlag: false,
  flaggedByMe: false,
  ...p,
});

export const reviewItem = (p: Partial<CheckinReviewItem> = {}): CheckinReviewItem => ({
  id: 'k1',
  challengeId: 'c1',
  challengeTitle: '30 dias de treino',
  challengeKind: 'PHOTO',
  type: 'photo',
  displayName: 'Marina N.',
  date: '2026-10-15',
  capturedAt: '2026-10-15T23:40:00.000Z',
  source: 'member',
  why: 'Foto parecida com a de ontem',
  flags: 2,
  photoUrl: 'https://cdn.test/prova.jpg',
  caption: null,
  workoutLinked: true,
  points: 1,
  ...p,
});
