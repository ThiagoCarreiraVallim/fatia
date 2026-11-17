import { describe, expect, it } from 'vitest';
import {
  deviceLabel,
  NOTIFICATION_KINDS,
  notificationGroups,
  notificationPreview,
  notificationTarget,
  vapidKeyBytes,
  type NotificationPreferences,
} from '../notifications';

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

describe('tela de Notificações (prancha Al-V4, #389)', () => {
  const tudo = Object.fromEntries(
    NOTIFICATION_KINDS.map((k) => [k, true]),
  ) as NotificationPreferences;

  it('três grupos, na ordem da prancha; "Da sua equipe" só com equipe', () => {
    const com = notificationGroups({ team: { name: 'Helena' } });
    expect(com.map((g) => [g.title, g.detail])).toEqual([
      ['Da sua equipe', 'Helena'],
      ['Comunidade', null],
      ['Opcional', null],
    ]);
    expect(com[0]!.items.map((i) => i.kind)).toEqual([
      'PLAN_RECEIVED',
      'ASSESSMENT_REQUESTED',
      'QUESTIONNAIRE',
    ]);
    expect(com[1]!.items.map((i) => i.kind)).toEqual([
      'COMMUNITY',
      'ANNOUNCEMENTS',
      'SCHEDULE',
      'SCHEDULE_REMINDER',
      'CHALLENGES',
      'FEED',
      'MODERATION',
      'CHAT',
    ]);
    expect(com[2]!.items.map((i) => i.label)).toEqual(['Aniversário']);
    expect(notificationGroups({ team: null }).map((g) => g.title)).toEqual([
      'Comunidade',
      'Opcional',
    ]);
  });

  it('os avisos de cobrança (#386) existem, mas não têm chave na tela', () => {
    expect(NOTIFICATION_KINDS).toContain('BILLING');
    const naTela = notificationGroups({ team: { name: 'Helena' } }).flatMap((g) =>
      g.items.map((i) => i.kind as string),
    );
    expect(naTela).not.toContain('BILLING');
  });

  it('a prévia segue o que está ligado, com a equipe e a comunidade de verdade', () => {
    const ctx = { team: { name: 'Helena' }, community: { name: 'Academia Demo' } };
    expect(notificationPreview(tudo, ctx)).toBe(
      'Helena enviou um plano novo · 5 novidades em Academia Demo',
    );
    expect(notificationPreview({ ...tudo, PLAN_RECEIVED: false }, ctx)).toBe(
      '5 novidades em Academia Demo',
    );
    expect(notificationPreview({ ...tudo, PLAN_RECEIVED: false, COMMUNITY: false }, ctx)).toBe(
      'Sua resposta do chat está pronta',
    );
    const nada = Object.fromEntries(
      NOTIFICATION_KINDS.map((k) => [k, false]),
    ) as NotificationPreferences;
    expect(notificationPreview(nada, ctx)).toBe('Tudo desligado');
    expect(notificationPreview(tudo, { team: null, community: null })).toBe(
      '5 novidades na sua comunidade',
    );
  });
});
