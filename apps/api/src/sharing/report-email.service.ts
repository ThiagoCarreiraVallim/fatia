import {
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GroupRole, MembershipStatus } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { hourInTz } from '../insights/helpers/time-buckets';
import { reportUnsubscribeToken } from '../notifications/announcement-email.service';
import { EmailService, type EmailMessage } from '../notifications/email.service';
import { dateInTz, dayBoundsInTz } from '../progress/helpers/date-tz';
import { firstBusinessDay } from './business-day';
import { ReportService, shiftMonth } from './report.service';
import type { MonthReport } from './report.types';

/** O e-mail sai a partir desta hora do 1º dia útil, no fuso da comunidade. */
export const REPORT_EMAIL_HOUR = 8;
const EVERY_MS = 30 * 60_000;
const SECRET_MIN = 16;
const SMALL = 'amostra pequena demais para mostrar';

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** "outubro", de `2026-10`. */
export function monthName(month: string): string {
  return MESES[Number(month.slice(5, 7)) - 1]!;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const num = (n: number) => n.toLocaleString('pt-BR');

function initials(name: string): string {
  const partes = name.trim().split(/\s+/).filter(Boolean);
  const letras =
    partes.length > 1 ? partes[0]![0]! + partes[1]![0]! : (partes[0] ?? '?').slice(0, 2);
  return letras.toUpperCase();
}

/**
 * O e-mail mensal (Ex-02): marca da comunidade, % de ativos, sessões,
 * voltaram após 14 dias e sem treino há N+ dias, e "Abrir no painel". O que
 * não passa do mínimo de 5 sai como "amostra pequena". Nenhum nome de membro.
 */
export function reportEmail(p: {
  to: string;
  report: MonthReport;
  panelUrl: string;
  unsubscribeUrl: string;
  oneClickUrl: string;
}): EmailMessage {
  const r = p.report;
  const mes = monthName(r.month);
  const a = r.activeMembers;
  const delta = a.deltaPts === null ? '' : ` · ${a.deltaPts > 0 ? '+' : ''}${a.deltaPts} pts`;
  const cartoes: { valor: string | null; texto: string }[] = [
    {
      valor: a.percent === null ? null : `${a.percent}%`,
      texto: `dos que aceitaram entrar nas estatísticas estão ativos${delta}`,
    },
    {
      valor: r.sessions.total === null ? null : num(r.sessions.total),
      texto: 'sessões de treino',
    },
    { valor: r.returned === null ? null : num(r.returned), texto: 'voltaram após 14 dias' },
    {
      valor: r.atRisk === null ? null : num(r.atRisk),
      texto: `sem treino há ${r.riskDays}+ dias`,
    },
  ];
  const linha = (c: (typeof cartoes)[number]) =>
    c.valor === null ? `${c.texto}: ${SMALL}` : `${c.valor} ${c.texto}`;
  const aviso = 'Grupos com menos de 5 pessoas não aparecem. Ninguém é citado por nome.';
  const text = [
    `${r.groupName} · Relatório de ${mes} · só agregado`,
    '',
    ...cartoes.map(linha),
    '',
    `Abrir no painel: ${p.panelUrl}`,
    '',
    aviso,
    `Para não receber mais este relatório por e-mail: ${p.unsubscribeUrl}`,
  ].join('\n');

  const nome = escapeHtml(r.groupName);
  const celulas = cartoes.map(
    (c) =>
      `<td width="50%" style="padding:6px"><div style="background:#f4f4f1;border-radius:12px;padding:16px"><b style="font-size:${c.valor === null ? '15px' : '28px'};color:#1b1b1b">${escapeHtml(c.valor ?? SMALL)}</b><div style="color:#555;font-size:13px">${escapeHtml(c.texto)}</div></div></td>`,
  );
  const grade = `<tr>${celulas[0]}${celulas[1]}</tr><tr>${celulas[2]}${celulas[3]}</tr>`;
  // Cliente de e-mail: tabela, estilo inline e fonte do sistema. A cor é a da
  // marca padrão da comunidade, com o texto escuro dela (contraste ≥ 4,5:1).
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#e9e9e6;font-family:Arial,Helvetica,sans-serif;color:#1b1b1b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#ff7a1a;padding:24px 32px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:44px;height:44px;border-radius:14px;background:#1f0e00;color:#ff7a1a;font-weight:800;text-align:center;vertical-align:middle">${escapeHtml(initials(r.groupName))}</td><td style="padding-left:12px;color:#1f0e00;font-size:18px;font-weight:700">${nome}</td></tr></table></td></tr>
<tr><td style="padding:28px 26px 8px;font-size:12px;font-weight:800;letter-spacing:.06em;color:#555">RELATÓRIO DE ${escapeHtml(mes.toUpperCase())} · SÓ AGREGADO</td></tr>
<tr><td style="padding:0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${grade}</table></td></tr>
<tr><td style="padding:16px 26px"><a href="${escapeHtml(p.panelUrl)}" style="display:inline-block;padding:14px 26px;border-radius:12px;font-weight:800;text-decoration:none;background:#1b1b1b;color:#ffffff">Abrir no painel</a></td></tr>
<tr><td style="padding:0 26px 24px;font-size:13px;color:#555">${aviso}</td></tr>
<tr><td style="padding:18px 26px;border-top:1px solid #eeeeee;font-size:12px;color:#555">Relatório de ${nome} no Fatia, para quem administra a comunidade. <a href="${escapeHtml(p.unsubscribeUrl)}" style="color:#555">Não receber mais este relatório por e-mail</a>.</td></tr>
</table></td></tr></table></body></html>`;
  return {
    to: p.to,
    subject: `${r.groupName}: relatório de ${mes}`,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${p.oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

/**
 * O e-mail mensal do relatório (#400, Ex-02). No 1º dia útil do mês (segunda
 * a sexta, fora feriado nacional), a partir das 8 h no fuso da comunidade,
 * sai o relatório do mês que acabou para o dono e para quem da equipe ele
 * marcou. Se o servidor estiver fora nesse dia, sai no próximo passe do mês.
 *
 * Uma vez por comunidade e mês: o mês é reivindicado na própria linha do grupo
 * (`updateMany` condicional em `reportEmailMonth`) antes de montar o e-mail,
 * então duas instâncias nunca mandam o mesmo mês. Se o envio falhar depois de
 * reivindicar, o mês fica perdido: melhor que mandar duas vezes.
 *
 * Sem SMTP ou sem o segredo do descadastro, nada sai (e nada é reivindicado):
 * e-mail sem descadastro não vai.
 */
@Injectable()
export class ReportEmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportEmailService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly secret: string;
  private readonly origin: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportService,
    @Optional() private readonly email?: EmailService,
    @Optional() config?: ConfigService,
  ) {
    this.secret = config?.get<string>('EMAIL_UNSUBSCRIBE_SECRET') ?? '';
    this.origin = (config?.get<string>('WEB_ORIGIN') ?? 'http://localhost:3030').replace(/\/$/, '');
  }

  onModuleInit(): void {
    // `unref`: o timer não segura o processo (nem o jest) só por existir.
    this.timer = setInterval(() => {
      void this.sendMonthlyReports(new Date()).catch((err: unknown) =>
        this.logger.warn(
          `E-mail mensal do relatório falhou: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }, EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  get available(): boolean {
    return Boolean(this.email?.enabled) && this.secret.length >= SECRET_MIN;
  }

  /** Manda o relatório do mês anterior a cada comunidade no dia dela; devolve quantas. */
  async sendMonthlyReports(now: Date): Promise<number> {
    if (!this.available) return 0;
    const grupos = await this.prisma.group.findMany({
      where: { reportEmailEnabled: true },
      select: { id: true, timezone: true, createdAt: true, reportEmailMonth: true },
    });
    let sent = 0;
    for (const g of grupos) {
      const hoje = dateInTz(now, g.timezone);
      const mes = hoje.slice(0, 7);
      const anterior = shiftMonth(mes, -1);
      if (g.reportEmailMonth && g.reportEmailMonth >= anterior) continue;
      const diaUtil = firstBusinessDay(mes);
      if (hoje < diaUtil) continue;
      if (hoje === diaUtil && hourInTz(now, g.timezone) < REPORT_EMAIL_HOUR) continue;
      // Comunidade criada neste mês não tem mês anterior para contar.
      if (g.createdAt >= dayBoundsInTz(`${mes}-01`, g.timezone).start) continue;

      const claimed = await this.prisma.group.updateMany({
        where: {
          id: g.id,
          reportEmailEnabled: true,
          OR: [{ reportEmailMonth: null }, { reportEmailMonth: { lt: anterior } }],
        },
        data: { reportEmailMonth: anterior },
      });
      if (claimed.count === 0) continue;
      try {
        if (await this.sendOne(g.id, anterior, now)) sent += 1;
      } catch (err) {
        this.logger.warn(
          `Relatório de ${anterior} da comunidade ${g.id} não saiu: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return sent;
  }

  private async sendOne(groupId: string, month: string, now: Date): Promise<boolean> {
    const quem = await this.prisma.groupMembership.findMany({
      where: {
        groupId,
        status: MembershipStatus.ACTIVE,
        user: { reportEmailOptOutAt: null },
        OR: [
          { role: GroupRole.OWNER },
          { role: { in: [GroupRole.PROFESSIONAL, GroupRole.CREATOR] }, reportEmail: true },
        ],
      },
      select: { user: { select: { id: true, email: true } } },
    });
    if (!quem.length) return false;
    const report = await this.reports.build(groupId, month, now);
    const panelUrl = `${this.origin}/org/${groupId}/report?month=${month}`;
    let algum = false;
    for (const { user } of quem) {
      if (!user.email) continue;
      const t = reportUnsubscribeToken(user.id, this.secret);
      const ok = await this.email!.send(
        reportEmail({
          to: user.email,
          report,
          panelUrl,
          unsubscribeUrl: `${this.origin}/descadastro?t=${t}`,
          oneClickUrl: `${this.origin}/api/descadastro?t=${t}`,
        }),
      );
      algum ||= ok;
    }
    return algum;
  }
}
