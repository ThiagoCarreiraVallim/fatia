import { describe, expect, it } from 'vitest';
import { linkInviteForm, linkInviteInput } from '../link-invite-form';

describe('formulário do link de convite no app (#401)', () => {
  it('membro: vazio é sem limite, e o link vale 7 dias', () => {
    expect(linkInviteForm('MEMBER')).toEqual({
      defaultUses: '',
      usesPlaceholder: 'Limite de usos (vazio = sem limite)',
      validity: 'Vale por 7 dias.',
    });
    expect(linkInviteInput('MEMBER', '')).toEqual({ role: 'MEMBER', expiresInDays: 7 });
    expect(linkInviteInput('MEMBER', '25')).toEqual({
      role: 'MEMBER',
      maxUses: 25,
      expiresInDays: 7,
    });
  });

  it('equipe: 1 uso e 30 dias por padrão, sem "sem limite" nem "sem prazo"', () => {
    for (const role of ['PROFESSIONAL', 'CREATOR'] as const) {
      const f = linkInviteForm(role);
      expect(f.defaultUses).toBe('1');
      expect(f.usesPlaceholder).not.toMatch(/sem limite/i);
      expect(f.validity).toBe('Convite de equipe vale 30 dias e tem limite de usos.');
      // Campo apagado não vira "sem limite": volta para 1 uso.
      expect(linkInviteInput(role, '')).toEqual({ role, maxUses: 1, expiresInDays: 30 });
      expect(linkInviteInput(role, '0')).toEqual({ role, maxUses: 1, expiresInDays: 30 });
      expect(linkInviteInput(role, '3')).toEqual({ role, maxUses: 3, expiresInDays: 30 });
    }
  });
});
