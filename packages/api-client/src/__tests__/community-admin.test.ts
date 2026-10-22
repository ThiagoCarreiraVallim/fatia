import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { insightsApi, orgApi, seatsApi } from '../community-admin';
import { configureApiClient, resetApiClient } from '../http';

const fetchMock = vi.fn();

function pedido(i = 0) {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return {
    method: init.method ?? 'GET',
    url,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
}

describe('painel da comunidade no cliente', () => {
  beforeEach(() => {
    configureApiClient({ resolveUrl: (path) => path, fetch: fetchMock as unknown as typeof fetch });
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
  });

  afterEach(() => {
    fetchMock.mockReset();
    resetApiClient();
  });

  it('cria e edita a comunidade', async () => {
    await orgApi.create({ type: 'SPONSORED', name: 'Box', joinPolicy: 'APPROVAL' });
    await orgApi.update('g1', { description: null });
    expect(pedido(0)).toEqual({
      method: 'POST',
      url: '/api/groups',
      body: { type: 'SPONSORED', name: 'Box', joinPolicy: 'APPROVAL' },
    });
    expect(pedido(1)).toEqual({
      method: 'PATCH',
      url: '/api/groups/g1',
      body: { description: null },
    });
  });

  it('aprova com papel, muda papel, remove e transfere', async () => {
    await orgApi.approve('g1', 'm1', 'PROFESSIONAL');
    await orgApi.approve('g1', 'm2');
    await orgApi.setRole('g1', 'm1', 'CREATOR');
    await orgApi.removeMember('g1', 'm3');
    await orgApi.transferOwner('g1', 'm1');
    expect(fetchMock.mock.calls.map((_, i) => pedido(i))).toEqual([
      { method: 'POST', url: '/api/groups/g1/members/m1/approve', body: { role: 'PROFESSIONAL' } },
      { method: 'POST', url: '/api/groups/g1/members/m2/approve', body: {} },
      { method: 'PATCH', url: '/api/groups/g1/members/m1', body: { role: 'CREATOR' } },
      { method: 'DELETE', url: '/api/groups/g1/members/m3', body: undefined },
      { method: 'POST', url: '/api/groups/g1/owner', body: { membershipId: 'm1' } },
    ]);
  });

  it('convites: um, em lote, reenviar e revogar', async () => {
    await orgApi.createInvite('g1', { role: 'MEMBER', maxUses: 10 });
    await orgApi.createInviteBatch('g1', { emails: ['a@x.com'], role: 'MEMBER' });
    await orgApi.resendInvite('g1', 'i1');
    await orgApi.revokeInvite('g1', 'i1');
    expect(fetchMock.mock.calls.map((_, i) => pedido(i))).toEqual([
      { method: 'POST', url: '/api/groups/g1/invites', body: { role: 'MEMBER', maxUses: 10 } },
      {
        method: 'POST',
        url: '/api/groups/g1/invites/batch',
        body: { emails: ['a@x.com'], role: 'MEMBER' },
      },
      { method: 'POST', url: '/api/groups/g1/invites/i1/resend', body: undefined },
      { method: 'DELETE', url: '/api/groups/g1/invites/i1', body: undefined },
    ]);
  });

  it('assentos: compra, ajuste, atribuição e faturas', async () => {
    await seatsApi.checkout('g1', 3, '11222333000181');
    await seatsApi.update('g1', 5);
    await seatsApi.assign('g1', 'm1');
    await seatsApi.unassign('g1', 'm1');
    await seatsApi.invoices('g1');
    expect(fetchMock.mock.calls.map((_, i) => pedido(i))).toEqual([
      {
        method: 'POST',
        url: '/api/groups/g1/seats/checkout',
        body: { seats: 3, taxId: '11222333000181' },
      },
      { method: 'PATCH', url: '/api/groups/g1/seats', body: { seats: 5 } },
      { method: 'POST', url: '/api/groups/g1/seats/assignments/m1', body: undefined },
      { method: 'DELETE', url: '/api/groups/g1/seats/assignments/m1', body: undefined },
      { method: 'GET', url: '/api/groups/g1/seats/invoices', body: undefined },
    ]);
  });

  it('insights pedem recorte e período nomeados', async () => {
    await insightsApi.aggregate('g1', 'retention', 'sessions_by_week', 'last_90_days');
    expect(pedido().url).toBe(
      '/api/groups/g1/insights/retention?cut=sessions_by_week&period=last_90_days',
    );
    expect(insightsApi.behaviorExportPath('g1', 'modality_mix', 'last_30_days')).toBe(
      '/api/groups/g1/insights/behavior/export?cut=modality_mix&period=last_30_days',
    );
  });
});
