import { apiFetch } from '../api';

export interface MeUser {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
  timezone: string;
  heightCm: number | null;
}

export interface UpdateMeInput {
  name?: string;
  heightCm?: number;
  timezone?: string;
}

export const usersApi = {
  me: () => apiFetch<MeUser>('/api/users/me'),
  updateMe: (body: UpdateMeInput) =>
    apiFetch<MeUser>('/api/users/me', { method: 'PATCH', body: JSON.stringify(body) }),
};
