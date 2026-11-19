import type { EmailMessage } from './email.service';

const ROLE_LABEL = {
  MEMBER: 'membro',
  PROFESSIONAL: 'profissional da equipe',
  CREATOR: 'criador de conteúdo',
  OWNER: 'dono',
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** "AD" de "Academia Demo": a marca da comunidade no topo do e-mail. */
function initials(name: string): string {
  const partes = name.trim().split(/\s+/).filter(Boolean);
  return (
    partes
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || 'F'
  );
}

/**
 * O aviso de validade que vale para **este** convite (#401): o nominal vence
 * em 30 dias e vale uma vez; a data vem do convite, não de um número fixo.
 */
export function inviteValidityText(expiresAt: Date | null, now: Date = new Date()): string {
  if (!expiresAt) return 'Não tem prazo e vale uma vez.';
  const dias = Math.max(1, Math.round((expiresAt.getTime() - now.getTime()) / DAY_MS));
  return `Vale por ${dias} ${dias === 1 ? 'dia' : 'dias'} e uma vez.`;
}

/**
 * Convite por e-mail (prancha Ex-01). Só o nome da comunidade, quem convidou,
 * o papel e o link — nunca dado de saúde de ninguém. O que a pessoa
 * compartilha é escolhido depois, na tela do convite, com tudo desmarcado.
 */
export function inviteEmail(params: {
  to: string;
  groupName: string;
  inviterName: string;
  role: keyof typeof ROLE_LABEL;
  url: string;
  expiresAt: Date | null;
  now?: Date;
}): EmailMessage {
  const papel = ROLE_LABEL[params.role];
  const validade = inviteValidityText(params.expiresAt, params.now);
  // O que a pessoa ganha muda com o papel: membro treina com a turma; equipe atende.
  const ganha =
    params.role === 'MEMBER'
      ? 'treinos da equipe, desafios com a turma e o que a comunidade oferece no app'
      : 'o painel da comunidade, para acompanhar quem autorizar';
  const subject = `${params.inviterName} convidou você para a ${params.groupName}`;
  const text = [
    `${params.inviterName} convidou você para a ${params.groupName} no Fatia.`,
    '',
    `Entre como ${papel}: ${ganha}. Você escolhe o que a equipe vê.`,
    '',
    `Aceitar convite: ${params.url}`,
    '',
    `${validade} Se não esperava este e-mail, pode ignorar.`,
  ].join('\n');
  const g = escapeHtml(params.groupName);
  const who = escapeHtml(params.inviterName);
  const marca = escapeHtml(initials(params.groupName));
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#e9e9e6;font-family:Inter,Arial,sans-serif;color:#1b1b1b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#ff7a1a;padding:24px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:44px;height:44px;border-radius:14px;background:#1f0e00;color:#ff7a1a;font-weight:800;text-align:center;vertical-align:middle">${marca}</td>
<td style="padding-left:12px;font-size:18px;font-weight:800;color:#1f0e00">${g}</td></tr></table></td></tr>
<tr><td style="padding:32px 32px 8px;font-size:26px;line-height:1.15;font-weight:800">${who} convidou você para a ${g}</td></tr>
<tr><td style="padding:8px 32px 20px;font-size:15px;line-height:1.55;color:#444">Entre como <b>${papel}</b>: ${ganha}. Você escolhe o que a equipe vê.</td></tr>
<tr><td style="padding:0 32px 20px"><a href="${escapeHtml(params.url)}" style="display:inline-block;background:#ff7a1a;color:#1f0e00;font-weight:800;text-decoration:none;padding:14px 26px;border-radius:12px">Aceitar convite</a></td></tr>
<tr><td style="padding:0 32px 28px;font-size:13px;color:#777">${validade} Se não esperava este e-mail, pode ignorar.</td></tr>
<tr><td style="padding:18px 32px;border-top:1px solid #eeeeee;font-size:12px;color:#777">Fatia · Você recebe este e-mail porque alguém da ${g} convidou este endereço.</td></tr>
</table></td></tr></table></body></html>`;
  return { to: params.to, subject, text, html };
}
