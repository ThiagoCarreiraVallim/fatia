import { describe, expect, it } from 'vitest';
import {
  grantableRolesFor,
  groupCan,
  staffLastAccessLabel,
  permissionCell,
  staffChangeLine,
  staffGroups,
  staffSubtitle,
  type StaffView,
} from '../index';

const p = (over: Partial<StaffView>): StaffView => ({
  membershipId: 'm',
  name: 'X',
  role: 'PROFESSIONAL',
  specialty: null,
  accompanies: 0,
  panelSeenAt: null,
  isMe: false,
  manageable: true,
  ...over,
});

describe('Equipe e permissões (Pn-19, #404)', () => {
  const staff = [
    p({ membershipId: 'o', name: 'Bruno', role: 'OWNER', accompanies: 2 }),
    p({ membershipId: 'a', name: 'Carla', role: 'ADMIN', accompanies: null }),
    p({ membershipId: 'h', name: 'Helena', specialty: 'TRAINING', accompanies: 18 }),
    p({ membershipId: 'm', name: 'Marcos', specialty: 'NUTRITION', accompanies: 11 }),
    p({ membershipId: 'n', name: 'Nina', role: 'RECEPTION', accompanies: null }),
  ];

  it('agrupa por papel, na ordem da prancha, e grupo vazio some', () => {
    expect(staffGroups(staff).map((g) => [g.title, g.people.map((x) => x.name)])).toEqual([
      ['Donos e administradores', ['Bruno', 'Carla']],
      ['Profissionais e criadores', ['Helena', 'Marcos']],
      ['Recepção · não vê dados de alunos', ['Nina']],
    ]);
  });

  it('busca por nome, papel ou especialidade, sem acento', () => {
    expect(staffGroups(staff, 'nutri').flatMap((g) => g.people.map((x) => x.name))).toEqual([
      'Marcos',
    ]);
    expect(staffGroups(staff, 'recepcao').flatMap((g) => g.people.map((x) => x.name))).toEqual([
      'Nina',
    ]);
    expect(staffGroups(staff, 'zzz')).toEqual([]);
  });

  it('a linha de baixo diz o que o papel faz', () => {
    expect(staffSubtitle(staff[2]!)).toBe('personal · acompanha 18');
    expect(staffSubtitle(staff[4]!)).toMatch(/não vê dados de alunos/);
  });

  it('último acesso', () => {
    const now = new Date(2026, 10, 19, 12, 0);
    expect(staffLastAccessLabel(null, now)).toBe('ainda não abriu o painel');
    expect(staffLastAccessLabel(new Date(2026, 10, 19, 11, 58).toISOString(), now)).toBe(
      'último acesso agora',
    );
    expect(staffLastAccessLabel(new Date(2026, 10, 19, 9, 12).toISOString(), now)).toBe(
      'último acesso hoje 09:12',
    );
    expect(staffLastAccessLabel(new Date(2026, 10, 18, 9, 12).toISOString(), now)).toBe(
      'último acesso ontem',
    );
  });

  it('histórico em português', () => {
    expect(
      staffChangeLine({
        at: '',
        action: 'members.role',
        actorName: 'Bruno',
        targetName: 'Nina',
        targetCount: 1,
        from: 'PROFESSIONAL',
        to: 'RECEPTION',
      }),
    ).toBe('Bruno mudou Nina de profissional para recepção');
  });

  it('o admin dá só membro e recepção; papel que recebe vínculo é do dono', () => {
    expect(grantableRolesFor('ADMIN')).toEqual(['MEMBER', 'RECEPTION']);
    expect(grantableRolesFor('OWNER')).toContain('PROFESSIONAL');
    expect(
      staffChangeLine({
        at: '',
        action: 'members.approve',
        actorName: 'Bruno',
        targetName: 'Nina',
        targetCount: 1,
        from: null,
        to: 'PROFESSIONAL',
      }),
    ).toBe('Bruno aprovou Nina como profissional');
  });

  it('célula da tabela', () => {
    expect(permissionCell('ADMIN', ['OWNER', 'ADMIN'])).toBe('✓');
    expect(permissionCell('RECEPTION', ['OWNER'])).toBe('—');
  });

  it('groupCan segue as ações da API; sem elas, o espelho da matriz', () => {
    expect(groupCan({ role: 'ADMIN', actions: ['member.role'] }, 'member.role')).toBe(true);
    expect(groupCan({ role: 'ADMIN', actions: ['member.role'] }, 'billing.read')).toBe(false);
    expect(groupCan({ role: 'OWNER' }, 'billing.read')).toBe(true);
    expect(groupCan({ role: 'ADMIN' }, 'member.role')).toBe(true);
    expect(groupCan({ role: 'RECEPTION' }, 'member.file')).toBe(false);
  });
});
