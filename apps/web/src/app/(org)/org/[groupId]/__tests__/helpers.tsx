import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type { MyGroup, PanelMember, SeatsOverview } from '@fatia/api-client';

/** A comunidade aberta no painel, do ponto de vista de quem olha. */
export const grupo = (p: Partial<MyGroup> = {}): MyGroup => ({
  id: 'g1',
  type: 'SPONSORED',
  name: 'Academia Demo',
  slug: 'academia-demo',
  description: 'Treino e boa comida',
  joinPolicy: 'APPROVAL',
  role: 'OWNER',
  status: 'ACTIVE',
  membershipId: 'mo',
  joinedAt: '2026-10-01T00:00:00Z',
  createdAt: '2026-09-01T00:00:00Z',
  consentScopes: [],
  statsOptIn: false,
  hasAiSeat: false,
  avatarUrl: null,
  postPolicy: 'ALL_MEMBERS',
  requiredSharingScopes: [],
  ...p,
});

export const membro = (p: Partial<PanelMember> & { name: string }): PanelMember => ({
  membershipId: `m-${p.name}`,
  role: 'MEMBER',
  status: 'ACTIVE',
  joinedAt: '2026-10-02T00:00:00Z',
  scopesGrantedToMe: [],
  hasAiSeat: false,
  ...p,
});

export const assentos = (p: Partial<SeatsOverview> = {}): SeatsOverview => ({
  groupId: 'g1',
  unitPriceCents: 1490,
  webCheckout: true,
  pool: {
    seats: 2,
    nextPeriodSeats: null,
    status: 'ACTIVE',
    manual: false,
    currentPeriodEnd: '2026-11-17T03:00:00.000Z',
    graceEndsAt: null,
    cancelAtPeriodEnd: false,
    paymentUrl: null,
    monthlyCents: 2980,
    nextMonthlyCents: 2980,
  },
  assigned: 1,
  assignments: [
    { membershipId: 'm-Carla', name: 'Carla', assignedAt: '2026-10-03T00:00:00Z', ownPro: false },
  ],
  pendingCharges: [],
  ...p,
});

export function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
