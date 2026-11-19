import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NotificationKind } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { EmailService, type EmailMessage } from './email.service';

/** O segredo curto demais não protege nada: abaixo disto o e-mail fica desligado. */
const SECRET_MIN = 16;
const PROPOSITO = 'announcement-email:v1';

function assinatura(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`${PROPOSITO}:${userId}`).digest('base64url');
}

/**
 * O token do link de descadastro: o id da pessoa e a assinatura HMAC dele.
 * Não vence (o link de um e-mail antigo continua valendo) e só serve para
 * ligar ou desligar o e-mail de comunicados de quem ele nomeia.
 */
export function announcementUnsubscribeToken(userId: string, secret: string): string {
  return `${Buffer.from(userId).toString('base64url')}.${assinatura(userId, secret)}`;
}

/** O id da pessoa do token, ou `null` se a assinatura não confere. */
export function readAnnouncementUnsubscribeToken(token: string, secret: string): string | null {
  const [id64, sig] = token.split('.');
  if (!id64 || !sig || token.split('.').length !== 2) return null;
  const userId = Buffer.from(id64, 'base64url').toString('utf8');
  if (!userId) return null;
  const esperado = Buffer.from(assinatura(userId, secret));
  const recebido = Buffer.from(sig);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;
  return userId;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** O texto do comunicado sem a marcação do markdown-lite; o link vira "texto (url)". */
export function plainAnnouncementText(body: string): string {
  return body
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 ($2)')
    .replace(/^#+\s*/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/[*_`]/g, '')
    .trim();
}

export function announcementEmail(p: {
  to: string;
  groupName: string;
  title: string;
  body: string;
  unsubscribeUrl: string;
}): EmailMessage {
  const texto = plainAnnouncementText(p.body);
  const subject = `${p.groupName}: ${p.title}`;
  const text = [
    `${p.title}`,
    '',
    texto,
    '',
    `Comunicado de ${p.groupName} no Fatia.`,
    `Para não receber mais comunicados por e-mail: ${p.unsubscribeUrl}`,
  ].join('\n');
  const paragrafos = texto
    .split(/\n{2,}/)
    .map((t) => `<p style="margin:0 0 12px">${escapeHtml(t).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#131313;font-family:Inter,Arial,sans-serif;color:#e5e2e1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#1c1b1b;border-radius:16px;padding:32px">
<tr><td style="font-size:12px;font-weight:800;letter-spacing:.04em;color:#2ce500;padding-bottom:12px">AVISO DA EQUIPE · ${escapeHtml(p.groupName.toUpperCase())}</td></tr>
<tr><td style="font-size:18px;font-weight:700;padding-bottom:12px">${escapeHtml(p.title)}</td></tr>
<tr><td style="font-size:14px;line-height:1.5;color:#d6d3d1;padding-bottom:16px">${paragrafos}</td></tr>
<tr><td style="font-size:12px;color:#8a8a8a">Comunicado de ${escapeHtml(p.groupName)} no Fatia. <a href="${escapeHtml(p.unsubscribeUrl)}" style="color:#baccaf">Não receber mais comunicados por e-mail</a>.</td></tr>
</table></td></tr></table></body></html>`;
  return { to: p.to, subject, text, html };
}

/**
 * O e-mail do comunicado (#398): para quem deixou "Comunicados da comunidade"
 * (`ANNOUNCEMENTS`) ligado e não se descadastrou pelo link. Cada e-mail leva o
 * link de descadastro da própria pessoa, que funciona sem login.
 *
 * Só funciona com SMTP (`MAIL_SMTP_URL`) e com `EMAIL_UNSUBSCRIBE_SECRET`: sem
 * o segredo não há descadastro seguro, e sem descadastro não há e-mail.
 */
@Injectable()
export class AnnouncementEmailService {
  private readonly secret: string;
  private readonly origin: string;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly email?: EmailService,
    @Optional() config?: ConfigService,
  ) {
    this.secret = config?.get<string>('EMAIL_UNSUBSCRIBE_SECRET') ?? '';
    this.origin = (config?.get<string>('WEB_ORIGIN') ?? 'http://localhost:3030').replace(/\/$/, '');
  }

  get available(): boolean {
    return Boolean(this.email?.enabled) && this.secret.length >= SECRET_MIN;
  }

  /** Manda a cada pessoa que aceita; devolve quantos e-mails saíram. */
  async send(
    userIds: readonly string[],
    a: { groupName: string; title: string; body: string },
  ): Promise<number> {
    if (!this.available || userIds.length === 0) return 0;
    const [desligados, pessoas] = await Promise.all([
      this.prisma.notificationPreference.findMany({
        where: {
          userId: { in: [...userIds] },
          kind: NotificationKind.ANNOUNCEMENTS,
          enabled: false,
        },
        select: { userId: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: [...userIds] }, announcementEmailOptOutAt: null },
        select: { id: true, email: true },
      }),
    ]);
    const fora = new Set(desligados.map((d) => d.userId));
    let saiu = 0;
    for (const p of pessoas) {
      if (fora.has(p.id) || !p.email) continue;
      const ok = await this.email!.send(
        announcementEmail({
          to: p.email,
          groupName: a.groupName,
          title: a.title,
          body: a.body,
          unsubscribeUrl: `${this.origin}/descadastro?t=${announcementUnsubscribeToken(p.id, this.secret)}`,
        }),
      );
      if (ok) saiu += 1;
    }
    return saiu;
  }

  /** Para a página do link: a pessoa recebe hoje? */
  async status(token: string): Promise<{ subscribed: boolean }> {
    const u = await this.prisma.user.findUnique({
      where: { id: this.userOf(token) },
      select: { announcementEmailOptOutAt: true },
    });
    if (!u) throw new BadRequestException('Link de descadastro inválido');
    return { subscribed: u.announcementEmailOptOutAt === null };
  }

  /** Liga ou desliga o e-mail de comunicados de quem o token nomeia. Push não muda. */
  async setSubscribed(token: string, subscribed: boolean): Promise<{ subscribed: boolean }> {
    const r = await this.prisma.user.updateMany({
      where: { id: this.userOf(token) },
      data: { announcementEmailOptOutAt: subscribed ? null : new Date() },
    });
    if (r.count === 0) throw new BadRequestException('Link de descadastro inválido');
    return { subscribed };
  }

  private userOf(token: string): string {
    const id =
      this.secret.length >= SECRET_MIN
        ? readAnnouncementUnsubscribeToken(token, this.secret)
        : null;
    if (!id) throw new BadRequestException('Link de descadastro inválido');
    return id;
  }
}
