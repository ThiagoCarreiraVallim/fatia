import { Injectable, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { InviteOrigins, MonthReport, OriginsDays, ReportSettings } from './report.types';

export const ORIGINS_DAYS = [7, 30] as const;
/** Quantos meses para trás o relatório abre, além do atual. */
export const REPORT_MONTHS_BACK = 12;
export const WEEKLY_GOAL_MAX = 100_000;

/**
 * O relatório do mês e as origens dos convites (#400). Só o dono lê
 * (`insights.read`); a meta, o e-mail mensal e os destinatários são do dono
 * (`group.update`).
 */
@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  report(
    _viewerId: string,
    _groupId: string,
    _month?: string,
    _now = new Date(),
  ): Promise<MonthReport> {
    throw new NotImplementedException();
  }

  /** O relatório sem conferir papel: para o e-mail mensal. */
  build(_groupId: string, _month: string, _now = new Date()): Promise<MonthReport> {
    throw new NotImplementedException();
  }

  origins(
    _viewerId: string,
    _groupId: string,
    _days: OriginsDays,
    _now = new Date(),
  ): Promise<InviteOrigins> {
    throw new NotImplementedException();
  }

  settings(_viewerId: string, _groupId: string): Promise<ReportSettings> {
    throw new NotImplementedException();
  }

  updateSettings(
    _viewerId: string,
    _groupId: string,
    _input: { weeklySessionsGoal?: number | null; reportEmailEnabled?: boolean },
  ): Promise<ReportSettings> {
    throw new NotImplementedException();
  }

  setRecipient(
    _viewerId: string,
    _groupId: string,
    _membershipId: string,
    _enabled: boolean,
  ): Promise<ReportSettings> {
    throw new NotImplementedException();
  }
}
