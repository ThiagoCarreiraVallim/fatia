/**
 * Cliente de API do Fatia, compartilhado entre o PWA e o app nativo.
 *
 * Existe para que os dois apps falem com a API pelo **mesmo** código. Se cada um
 * tivesse a sua cópia, eles divergiriam — e divergência de cliente HTTP aparece
 * como bug de dado, que é o tipo mais caro de diagnosticar (issue #119).
 *
 * O que é específico de cada app fica na implementação de `ApiTransport`, não
 * aqui: como o token chega, para onde a URL aponta, o que fazer no 401.
 */

export type { ApiTransport } from './transport';
export {
  ApiError,
  apiFetch,
  configureApiClient,
  getConfiguredTransport,
  resetApiClient,
} from './http';

export * from './billing';
export * from './pro-block-copy';
export * from './chat';
export * from './chat-thread';
export * from './chat-cards';
export * from './ai-settings';
export * from './chat-markdown';
export * from './chat-quote';
export * from './plan';
export * from './food-shortcuts';
export * from './portions';
export * from './meal-templates';
export * from './meal-day';
export * from './day-rollover';
export * from './custom-food';
export * from './food-entry';
export * from './barcode';
export * from './goals';
export * from './nutrition';
export * from './nutrition-plan';
export * from './plan-offers';
export * from './nutrition-week';
export * from './progress';
export * from './progress-screens';
export * from './sharing';
export * from './community';
export * from './community-consent';
export * from './community-admin';
export * from './community-panel';
export * from './community-team';
export * from './community-invites';
export * from './panel-shell';
export * from './community-content';
export * from './community-exercises';
export * from './community-agent';
export * from './community-challenges';
export * from './community-feed';
export * from './community-home';
export * from './community-benefits';
export * from './content-panel';
export * from './markdown-lite';
export * from './users';
export * from './auth-experience';
export * from './units';
export * from './tutorials';
export * from './you';
export * from './workout';

export * from './workout/is-cardio';
export * from './workout/plan-config';
export * from './workout/plan-exercise-draft';
export * from './workout/rpe';
export * from './workout/set-prefill';
export * from './workout/prescription';
export * from './workout/quick-templates';
export * from './workout/circuit-timer';
export * from './workout/circuit-copy';
export * from './workout/history-copy';
export * from './workout/pending-exercises';
export * from './workout/session-cache';
export * from './session-view';
export * from './active-workout-bar';
export * from './workout-cards';
export * from './scroll-reveal';
export * from './workout-session-copy';
export * from './exercise-video';
export * from './streak-copy';
export * from './meal-timeline';
export * from './dashboard-copy';
export * from './today-copy';
export * from './ai-drawer';
export * from './plan-components-copy';
export * from './onboarding';
export * from './onboarding-flow';
export * from './navigation';
export * from './format';
export * from './notifications';
export * from './reminders';
export * from './undo';
export * from './plan-status';
export * from './connect-ai';
export * from './member-file';
export * from './review-queue';
export * from './seats-panel';
export * from './plan-programs';
export * from './plan-library';
export * from './community-offers';
export * from './month-report';
