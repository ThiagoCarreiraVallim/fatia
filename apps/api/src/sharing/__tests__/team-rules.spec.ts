import { GroupRole, ShareScope } from '@prisma/client';
import {
  can,
  canManageMember,
  canReceiveLink,
  GROUP_ACTIONS,
  PERMISSION_SUMMARY,
  permissionTable,
  rolesGrantableBy,
  scopesForSpecialty,
  STAFF_ROLES,
} from '../permissions';

/**
 * As regras da equipe (#404, ADR 043): quem dá que papel, em quem cada papel
 * mexe, o recorte da especialidade e a tabela "O que cada papel pode fazer",
 * que sai da mesma matriz do guarda.
 */
describe('papéis da equipe (#404)', () => {
  const ADMIN = 'ADMIN' as GroupRole;
  const RECEPTION = 'RECEPTION' as GroupRole;

  it('administrador e recepção nunca recebem vínculo', () => {
    expect(canReceiveLink(ADMIN)).toBe(false);
    expect(canReceiveLink(RECEPTION)).toBe(false);
  });

  it('a equipe da comunidade inclui administrador e recepção; o membro, não', () => {
    expect([...STAFF_ROLES].sort()).toEqual(
      ['OWNER', 'ADMIN', 'PROFESSIONAL', 'CREATOR', 'RECEPTION'].sort(),
    );
  });

  it('o dono dá qualquer papel menos o de dono; o administrador, nunca o de administrador', () => {
    expect([...rolesGrantableBy(GroupRole.OWNER)].sort()).toEqual(
      ['ADMIN', 'CREATOR', 'MEMBER', 'PROFESSIONAL', 'RECEPTION'].sort(),
    );
    expect([...rolesGrantableBy(ADMIN)].sort()).toEqual(
      ['CREATOR', 'MEMBER', 'PROFESSIONAL', 'RECEPTION'].sort(),
    );
    expect(rolesGrantableBy(GroupRole.PROFESSIONAL)).toEqual(['MEMBER']);
    expect(rolesGrantableBy(RECEPTION)).toEqual(['MEMBER']);
    expect(rolesGrantableBy(GroupRole.CREATOR)).toEqual([]);
    expect(rolesGrantableBy(GroupRole.MEMBER)).toEqual([]);
  });

  it('ninguém mexe no dono; o administrador não mexe em outro administrador', () => {
    expect(canManageMember(GroupRole.OWNER, GroupRole.OWNER)).toBe(false);
    expect(canManageMember(ADMIN, GroupRole.OWNER)).toBe(false);
    expect(canManageMember(ADMIN, ADMIN)).toBe(false);
    expect(canManageMember(GroupRole.OWNER, ADMIN)).toBe(true);
    expect(canManageMember(ADMIN, GroupRole.PROFESSIONAL)).toBe(true);
    expect(canManageMember(ADMIN, RECEPTION)).toBe(true);
    expect(canManageMember(GroupRole.PROFESSIONAL, GroupRole.MEMBER)).toBe(false);
  });

  it('nutrição recorta o vínculo para alimentação, metas, corpo e fotos das refeições', () => {
    expect([...scopesForSpecialty('NUTRITION')].sort()).toEqual(
      [ShareScope.BODY, ShareScope.GOALS, ShareScope.MEAL_PHOTOS, ShareScope.NUTRITION].sort(),
    );
    expect([...scopesForSpecialty('TRAINING')].sort()).toEqual(Object.values(ShareScope).sort());
    expect([...scopesForSpecialty(null)].sort()).toEqual(Object.values(ShareScope).sort());
  });

  it('recepção e administrador não têm faturas, posse nem ficha', () => {
    for (const papel of [ADMIN, RECEPTION]) {
      for (const acao of [
        'billing.read',
        'billing.manage',
        'group.transfer',
        'group.delete',
        'insights.read',
        'member.file',
        'panel.review',
      ] as const) {
        expect([papel, acao, can(papel, acao)]).toEqual([papel, acao, false]);
      }
    }
  });

  it('cada linha da tabela da tela aponta para ações que existem', () => {
    expect(PERMISSION_SUMMARY.length).toBeGreaterThan(8);
    for (const linha of PERMISSION_SUMMARY) {
      if (linha.rule === 'link') continue;
      expect(linha.actions.length).toBeGreaterThan(0);
      for (const a of linha.actions) expect(GROUP_ACTIONS).toContain(a);
    }
  });

  it('a tabela sai da matriz: o papel pode a linha quando pode todas as ações dela', () => {
    const t = permissionTable();
    expect(t.columns).toEqual(['OWNER', 'ADMIN', 'PROFESSIONAL', 'CREATOR', 'RECEPTION']);
    for (const row of t.rows) {
      const linha = PERMISSION_SUMMARY.find((l) => l.key === row.key)!;
      for (const papel of t.columns) {
        const esperado =
          linha.rule === 'link' ? canReceiveLink(papel) : linha.actions.every((a) => can(papel, a));
        expect([row.key, papel, row.roles.includes(papel)]).toEqual([row.key, papel, esperado]);
      }
    }
    const ver = t.rows.find((r) => r.key === 'student_data')!;
    expect(ver.roles).toEqual(['OWNER', 'PROFESSIONAL', 'CREATOR']);
    const faturas = t.rows.find((r) => r.key === 'billing')!;
    expect(faturas.roles).toEqual(['OWNER']);
  });
});
