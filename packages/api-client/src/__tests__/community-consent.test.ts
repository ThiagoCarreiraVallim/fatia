import { describe, expect, it } from 'vitest';
import {
  alreadyMemberGroupId,
  consentSummary,
  joinPolicyLabel,
  joinResultMessage,
  lockedScopes,
  membershipBadge,
  SCOPE_DETAILS,
  SHARE_SCOPES,
  teamRoleLabel,
  toggleScope,
  whoSees,
} from '../community-consent';
import { ApiError } from '../http';
import { SHARE_SCOPE_LABEL } from '../sharing';

describe('consentimento ao entrar na comunidade', () => {
  it('explica toda categoria, na ordem do rótulo', () => {
    expect(Object.keys(SCOPE_DETAILS)).toEqual([...SHARE_SCOPES]);
    expect(Object.keys(SHARE_SCOPE_LABEL)).toEqual([...SHARE_SCOPES]);
  });

  it('liga e desliga uma categoria mantendo a ordem canônica', () => {
    expect(toggleScope([], 'GOALS')).toEqual(['GOALS']);
    expect(toggleScope(['GOALS'], 'WORKOUT')).toEqual(['WORKOUT', 'GOALS']);
    expect(toggleScope(['WORKOUT', 'GOALS'], 'WORKOUT')).toEqual(['GOALS']);
  });

  it('trava o obrigatório que a pessoa compartilha, e não cobra o que ela nunca deu', () => {
    // Entrando: os obrigatórios vêm marcados e travados, na ordem canônica.
    expect(lockedScopes(['GOALS', 'WORKOUT'], ['GOALS', 'WORKOUT'])).toEqual(['WORKOUT', 'GOALS']);
    // Editando: quem entrou antes da exigência de Metas só tem Treino travado.
    expect(lockedScopes(['GOALS', 'WORKOUT'], ['WORKOUT', 'BODY'])).toEqual(['WORKOUT']);
    expect(lockedScopes([], ['WORKOUT'])).toEqual([]);
  });

  it.each([
    [[], 'Nada'],
    [['HABITS'], 'Água e passos'],
    [['GOALS', 'WORKOUT'], 'Treino e Metas'],
    [['NUTRITION', 'WORKOUT', 'GOALS'], 'Treino, Alimentação e Metas'],
  ] as const)('resume %j como "%s"', (scopes, esperado) => {
    expect(consentSummary(scopes)).toBe(esperado);
  });

  it('diz quem da equipe vê, sem contar membro comum', () => {
    expect(
      whoSees([
        { name: 'Ana', role: 'OWNER' },
        { name: 'Bruno', role: 'PROFESSIONAL' },
        { name: 'Caio', role: 'MEMBER' },
        { name: 'Duda', role: 'CREATOR' },
      ]),
    ).toBe('Ana (dono), Bruno (profissional) e Duda (criador de conteúdo)');
    expect(whoSees([{ name: 'Caio', role: 'MEMBER' }])).toBe('Ninguém da equipe, por enquanto');
  });

  it('rotula papel, regra de entrada e associação pendente', () => {
    expect(teamRoleLabel('PROFESSIONAL')).toBe('Profissional');
    expect(joinPolicyLabel('APPROVAL')).toBe('Entrada com aprovação do dono');
    expect(membershipBadge('INVITED')).toBe('Aguardando aprovação');
    expect(membershipBadge('ACTIVE')).toBeNull();
  });

  it('avisa quando a entrada ainda depende do dono', () => {
    expect(joinResultMessage({ status: 'ACTIVE' })).toBe('Você entrou na comunidade.');
    expect(joinResultMessage({ status: 'INVITED' })).toMatch(/quando o dono aprovar/);
  });

  it('acha a comunidade no 409 de quem já é membro, e só nele', () => {
    const conflito = new ApiError('Você já faz parte desta comunidade', 409, {
      message: 'Você já faz parte desta comunidade',
      groupId: 'g1',
    });
    expect(alreadyMemberGroupId(conflito)).toBe('g1');
    expect(
      alreadyMemberGroupId(new ApiError('Invite not found', 404, { groupId: 'g1' })),
    ).toBeNull();
    expect(alreadyMemberGroupId(new ApiError('x', 409, { message: 'x' }))).toBeNull();
    expect(alreadyMemberGroupId(new Error('rede'))).toBeNull();
  });
});
