export type ApiKeyScope = 'INVITES' | 'MEMBERS' | 'SENDS';
export type ApiQuotaState = 'ok' | 'near' | 'limit';

export interface ApiQuota {
  month: string;
  used: number;
  limit: number;
  renewsOn: string;
  state: ApiQuotaState;
}

export interface IntegrationRecipe {
  id: string;
  tool: 'Zapier' | 'Make';
  title: string;
  body: string;
  path: string;
  url: string;
}

export const API_KEY_SCOPE_LABEL = {} as Record<ApiKeyScope, string>;
export const INTEGRATION_RECIPES: readonly IntegrationRecipe[] = [];

export const apiKeysApi = {
  list: (_groupId: string): Promise<unknown> => Promise.reject(new Error('a fazer')),
  create: (_groupId: string, _input: { name: string; scopes?: ApiKeyScope[] }): Promise<unknown> =>
    Promise.reject(new Error('a fazer')),
  revoke: (_groupId: string, _keyId: string): Promise<unknown> =>
    Promise.reject(new Error('a fazer')),
};

export function apiKeyMask(_lastFour: string): string {
  throw new Error('a fazer');
}
export function apiKeyNameError(_name: string): string | null {
  throw new Error('a fazer');
}
export function quotaLabel(_q: ApiQuota): string {
  throw new Error('a fazer');
}
export function quotaPercent(_q: ApiQuota): number {
  throw new Error('a fazer');
}
export function quotaRenewsLabel(_q: ApiQuota): string {
  throw new Error('a fazer');
}
export function quotaHint(_q: ApiQuota): string {
  throw new Error('a fazer');
}
export function recipeSteps(_r: IntegrationRecipe, _apiBase: string): string[] {
  throw new Error('a fazer');
}
