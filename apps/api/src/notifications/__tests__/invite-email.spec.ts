import { inviteEmail } from '../invite-email';

/**
 * E-mail do convite (#401, prancha Ex-01): marca da comunidade, quem convidou,
 * papel, o que a pessoa ganha e o aviso de validade que reflete a validade real.
 */
describe('inviteEmail (Ex-01)', () => {
  const agora = new Date('2026-11-19T15:00:00Z');
  const DIA = 24 * 60 * 60 * 1000;
  const base = {
    to: 'ana@exemplo.com',
    groupName: 'Academia Demo',
    inviterName: 'Helena',
    role: 'MEMBER' as const,
    url: 'https://fatia.test/c/abc',
    now: agora,
  };

  it('convite nominal de 30 dias: "Vale por 30 dias e uma vez", com o botão Aceitar convite', () => {
    const m = inviteEmail({ ...base, expiresAt: new Date(agora.getTime() + 30 * DIA) });
    expect(m.subject).toBe('Helena convidou você para a Academia Demo');
    for (const corpo of [m.text, m.html]) {
      expect(corpo).toContain('Vale por 30 dias e uma vez');
      expect(corpo).toContain('Você escolhe o que a equipe vê');
    }
    expect(m.html).toContain('Aceitar convite');
    expect(m.html).toContain('>AD<');
    expect(m.text).toContain('membro');
  });

  it('a validade do texto é a do convite, não um número fixo', () => {
    const m = inviteEmail({ ...base, expiresAt: new Date(agora.getTime() + 7 * DIA) });
    expect(m.text).toContain('Vale por 7 dias e uma vez');
    expect(m.text).not.toContain('30 dias');
  });

  it('sem prazo muda o texto', () => {
    const m = inviteEmail({ ...base, expiresAt: null });
    expect(m.text).toContain('Não tem prazo e vale uma vez');
    expect(m.text).not.toMatch(/Vale por \d+ dias/);
  });

  it('o papel de equipe aparece no texto e nada do PRO de membro', () => {
    const m = inviteEmail({
      ...base,
      role: 'PROFESSIONAL',
      expiresAt: new Date(agora.getTime() + 30 * DIA),
    });
    expect(m.text).toContain('profissional da equipe');
    expect(m.text).not.toContain('PRO');
  });

  it('nome da comunidade e de quem convidou saem escapados no HTML', () => {
    const m = inviteEmail({
      ...base,
      groupName: '<b>Academia</b>',
      inviterName: 'Ana & Cia',
      expiresAt: new Date(agora.getTime() + 30 * DIA),
    });
    expect(m.html).not.toContain('<b>Academia</b>');
    expect(m.html).toContain('Ana &#38; Cia');
  });
});
