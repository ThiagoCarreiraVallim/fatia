import { Injectable, NotImplementedException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { EmailService, type EmailMessage } from '../notifications/email.service';
import { ReportService } from './report.service';
import type { MonthReport } from './report.types';

export function reportEmail(_p: {
  to: string;
  report: MonthReport;
  panelUrl: string;
  unsubscribeUrl: string;
  oneClickUrl: string;
}): EmailMessage {
  throw new Error('não implementado');
}

/** O e-mail mensal do relatório (#400, Ex-02). */
@Injectable()
export class ReportEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportService,
    @Optional() private readonly email?: EmailService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  /** Manda o relatório do mês anterior às comunidades no 1º dia útil; devolve quantas. */
  sendMonthlyReports(_now: Date): Promise<number> {
    throw new NotImplementedException();
  }
}
