import { NotificationKind } from '@fatia/db';
import { groupedNotice, NOTIFICATION_DEFAULTS } from '../notification.service';

describe('aviso agrupado (prancha Ex-06, #389)', () => {
  it('novidades da comunidade saem como "N novidades em <comunidade>", sem conteúdo', () => {
    expect(groupedNotice(NotificationKind.COMMUNITY, 5, 'Academia Demo', '/community/g')).toEqual({
      kind: 'COMMUNITY',
      title: '5 novidades em Academia Demo',
      body: 'Toque para ver.',
      url: '/community/g',
    });
    expect(groupedNotice(NotificationKind.ANNOUNCEMENTS, 1, 'Academia', '/x').title).toBe(
      '1 novidade em Academia',
    );
  });

  it('comentários no mural mantêm o texto próprio', () => {
    expect(groupedNotice(NotificationKind.FEED, 3, 'Academia', '/f').title).toBe(
      'Mais 3 comentários no seu post',
    );
  });

  it('reações no mural levam o nome de quem reagiu por último e quantos mais (Ex-06)', () => {
    const k = { key: 'reaction:p1', actor: 'Helena' };
    expect(groupedNotice(NotificationKind.FEED, 4, 'Academia', '/f', k)).toEqual({
      kind: 'FEED',
      title: 'Helena e mais 3 reagiram ao seu post',
      body: 'No mural de Academia.',
      url: '/f',
    });
    expect(groupedNotice(NotificationKind.FEED, 1, 'Academia', '/f', k).title).toBe(
      'Helena reagiu ao seu post',
    );
    // Sem o nome guardado, só a contagem.
    expect(
      groupedNotice(NotificationKind.FEED, 2, 'Academia', '/f', { key: 'reaction:p1' }).title,
    ).toBe('Mais 2 reações no seu post');
  });

  it('só o grupo "Opcional" nasce desligado', () => {
    const desligados = Object.entries(NOTIFICATION_DEFAULTS)
      .filter(([, on]) => !on)
      .map(([k]) => k);
    expect(desligados).toEqual(['BIRTHDAY']);
  });
});
