import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('today')
  today(@CurrentUser() user: CurrentUserPayload, @Query('timezone') tz?: string) {
    return this.dashboard.today(user.id, tz ?? 'UTC');
  }

  @Get('week')
  week(@CurrentUser() user: CurrentUserPayload, @Query('timezone') tz?: string) {
    return this.dashboard.week(user.id, tz ?? 'UTC');
  }
}
