import { announcementEmail, plainAnnouncementText } from '../announcement-email.service';

/** O texto e o HTML do e-mail de comunicado (#398, revisão). */
describe('e-mail de comunicado', () => {
  it('tira só os pares de marcação, fora dos links; a URL sai intacta', () => {
    expect(
      plainAnnouncementText(
        'Veja https://x.com/a_b_c*d e **forte** e _itálico_ e `código` e [o link](https://y.com/p_q*r_s)',
      ),
    ).toBe('Veja https://x.com/a_b_c*d e forte e itálico e código e o link (https://y.com/p_q*r_s)');
  });

  it('asterisco e sublinhado soltos ficam (5 * 3, nome_composto)', () => {
    expect(plainAnnouncementText('Faça 5 * 3 séries; arquivo nome_composto.pdf')).toBe(
      'Faça 5 * 3 séries; arquivo nome_composto.pdf',
    );
  });

  it('título, nome da comunidade e corpo com HTML saem escapados', () => {
    const m = announcementEmail({
      to: 'a@b.c',
      groupName: '<b onmouseover="x()">Academia</b>',
      title: '<script>alert(1)</script>',
      body: '<img src=x onerror=alert(1)> e [clique](javascript:alert(1))',
      unsubscribeUrl: 'https://app.fatia.test/descadastro?t=a.b',
      oneClickUrl: 'https://app.fatia.test/api/descadastro?t=a.b',
    });
    expect(m.html).not.toMatch(/<script|<img|<b |onerror=alert|href="javascript/i);
    expect(m.html).toContain('&#60;script&#62;');
    expect(m.html).toContain('&#60;img');
  });

  it('leva List-Unsubscribe com POST em um clique (RFC 8058)', () => {
    const m = announcementEmail({
      to: 'a@b.c',
      groupName: 'Academia',
      title: 'Oi',
      body: 'Texto',
      unsubscribeUrl: 'https://app.fatia.test/descadastro?t=a.b',
      oneClickUrl: 'https://app.fatia.test/api/descadastro?t=a.b',
    });
    expect(m.headers).toEqual({
      'List-Unsubscribe': '<https://app.fatia.test/api/descadastro?t=a.b>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
});
