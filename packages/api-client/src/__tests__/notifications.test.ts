import { describe, expect, it } from 'vitest';
import { deviceLabel, notificationTarget, vapidKeyBytes } from '../notifications';

describe('avisos no celular (helpers)', () => {
  it('o toque leva às telas da comunidade e ao convite', () => {
    expect(notificationTarget({ url: '/community/g1' })).toBe('/community/g1');
    expect(notificationTarget({ url: '/community/g1/feed' })).toBe('/community/g1/feed');
    expect(notificationTarget({ url: '/community/g1/challenges/c1' })).toBe(
      '/community/g1/challenges/c1',
    );
    expect(notificationTarget({ url: '/org/g1/members' })).toBe('/org/g1/members');
    expect(notificationTarget({ url: '/c/abc_DEF-123' })).toBe('/c/abc_DEF-123');
  });

  it('nunca leva para fora do app nem para rota inventada', () => {
    for (const url of [
      'https://evil.example/community/g1',
      '//evil.example/community/g1',
      'javascript:alert(1)',
      '/community/g1/feed?x=https://evil',
      '/community/../../etc',
      '/nada/aqui',
      '/c/abc/def',
      '/\\evil.example',
      'community/g1',
    ]) {
      expect(notificationTarget({ url })).toBeNull();
    }
    expect(notificationTarget(null)).toBeNull();
    expect(notificationTarget({ url: 42 })).toBeNull();
    expect(notificationTarget({ kind: 'workout-rest' })).toBeNull();
    expect(notificationTarget({ url: `/community/${'a'.repeat(400)}` })).toBeNull();
  });

  it('rótulo do celular: plataforma e quando foi usado', () => {
    const agora = new Date('2026-10-18T15:00:00Z');
    const d = (lastSeenAt: string) =>
      ({ id: 'd', platform: 'ANDROID', createdAt: lastSeenAt, lastSeenAt }) as const;
    expect(deviceLabel(d('2026-10-18T09:00:00Z'), agora)).toBe('Android · usado hoje');
    expect(deviceLabel(d('2026-10-17T09:00:00Z'), agora)).toBe('Android · usado ontem');
    expect(deviceLabel({ ...d('2026-10-08T09:00:00Z'), platform: 'IOS' }, agora)).toBe(
      'iPhone · usado há 10 dias',
    );
  });
});

describe('vapidKeyBytes', () => {
  it('base64url sem preenchimento vira os bytes da chave', () => {
    // "Fatia?" em base64 é "RmF0aWE/", em base64url sem "=" é "RmF0aWE_".
    expect(Array.from(vapidKeyBytes('RmF0aWE_'))).toEqual([70, 97, 116, 105, 97, 63]);
    expect(Array.from(vapidKeyBytes('YQ'))).toEqual([97]);
  });
});
