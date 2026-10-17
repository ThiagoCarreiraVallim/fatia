import { describe, expect, it } from 'vitest';
import { inviteTokenFromUrl, isInviteToken } from '../invite-link';

const TOKEN = 'Ab3_-'.repeat(8) + 'xyz';

describe('link de convite', () => {
  it.each([
    [`fatia://c/${TOKEN}`],
    [`https://app.fat.ia.br/c/${TOKEN}`],
    [`https://app.fat.ia.br/c/${TOKEN}/`],
    [`https://app.fat.ia.br/c/${TOKEN}?utm=x`],
    [`/c/${TOKEN}`],
  ])('acha o token em %s', (url) => {
    expect(inviteTokenFromUrl(url)).toBe(TOKEN);
  });

  it.each([
    [null],
    [''],
    ['fatia://c/curto'],
    [`https://app.fat.ia.br/community/${TOKEN}`],
    [`https://app.fat.ia.br/c/${TOKEN}a`],
    [`https://app.fat.ia.br/c/${TOKEN.slice(0, 42)}!`],
  ])('recusa %j', (url) => {
    expect(inviteTokenFromUrl(url)).toBeNull();
  });

  it('confere o formato do token sozinho', () => {
    expect(isInviteToken(TOKEN)).toBe(true);
    expect(isInviteToken('x')).toBe(false);
    expect(isInviteToken(undefined)).toBe(false);
  });
});
