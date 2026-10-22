import type { EmailMessage } from './email.service';

const ROLE_LABEL = {
  MEMBER: 'membro',
  PROFESSIONAL: 'profissional da equipe',
  CREATOR: 'criador de conteúdo',
  OWNER: 'dono',
} as const;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Convite por e-mail. Só o nome da comunidade, quem convidou e o link —
 * nunca dado de saúde de ninguém. O que a pessoa compartilha é escolhido
 * depois, na tela do convite, com tudo desmarcado.
 */
export function inviteEmail(params: {
  to: string;
  groupName: string;
  inviterName: string;
  role: keyof typeof ROLE_LABEL;
  url: string;
  expiresAt: Date;
}): EmailMessage {
  const papel = ROLE_LABEL[params.role];
  const validade = params.expiresAt.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Sao_Paulo',
  });
  const subject = `${params.inviterName} convidou você para ${params.groupName} no Fatia`;
  const text = [
    `${params.inviterName} convidou você para entrar em ${params.groupName} no Fatia, como ${papel}.`,
    '',
    `Aceite o convite: ${params.url}`,
    '',
    `Na hora de entrar você escolhe o que compartilhar com a equipe — nada vem marcado. O convite vale até ${validade}.`,
    '',
    'Se não esperava este e-mail, é só ignorar.',
  ].join('\n');
  const g = escapeHtml(params.groupName);
  const who = escapeHtml(params.inviterName);
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#131313;font-family:Inter,Arial,sans-serif;color:#e5e2e1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#1c1b1b;border-radius:16px;padding:32px">
<tr><td style="font-size:24px;font-weight:800;color:#2ce500;padding-bottom:16px">Fatia</td></tr>
<tr><td style="font-size:18px;font-weight:700;padding-bottom:8px">${who} convidou você para ${g}</td></tr>
<tr><td style="font-size:14px;color:#baccaf;padding-bottom:24px">Você entra como ${papel}. Na hora de entrar você escolhe o que compartilhar com a equipe — nada vem marcado.</td></tr>
<tr><td style="padding-bottom:24px"><a href="${escapeHtml(params.url)}" style="display:inline-block;background:#2ce500;color:#131313;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:12px">Ver o convite</a></td></tr>
<tr><td style="font-size:12px;color:#8a8a8a">O convite vale até ${validade}. Se não esperava este e-mail, é só ignorar.</td></tr>
</table></td></tr></table></body></html>`;
  return { to: params.to, subject, text, html };
}
