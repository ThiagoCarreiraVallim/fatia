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
export { ApiError, apiFetch, configureApiClient, resetApiClient } from './http';

export * from './goals';
export * from './nutrition';
export * from './progress';
export * from './users';
export * from './workout';

export * from './workout/is-cardio';
export * from './workout/rpe';
export * from './workout/quick-templates';
export * from './session-view';
