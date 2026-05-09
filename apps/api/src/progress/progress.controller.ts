import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { WeightLogService } from './weight-log.service';
import { StepLogService } from './step-log.service';
import { ProgressService } from './progress.service';
import { DashboardService } from './dashboard.service';
import { CreateWeightLogDto, ListWeightLogsDto, UpdateWeightLogDto } from './dto/weight-log.dto';
import { CreateStepLogDto, ListStepLogsDto, UpdateStepLogDto } from './dto/step-log.dto';

@Controller()
export class ProgressController {
  constructor(
    private readonly weights: WeightLogService,
    private readonly steps: StepLogService,
    private readonly progress: ProgressService,
    private readonly dashboard: DashboardService,
  ) {}

  // -------- Weight logs --------
  @Post('weight-logs')
  createWeight(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateWeightLogDto) {
    return this.weights.create(dto, user.id);
  }

  @Get('weight-logs')
  listWeights(@CurrentUser() user: CurrentUserPayload, @Query() q: ListWeightLogsDto) {
    return this.weights.list(q, user.id);
  }

  @Patch('weight-logs/:id')
  updateWeight(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateWeightLogDto,
  ) {
    return this.weights.update(id, dto, user.id);
  }

  @Delete('weight-logs/:id')
  deleteWeight(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.weights.delete(id, user.id);
  }

  // -------- Step logs --------
  @Post('step-logs')
  createStep(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateStepLogDto) {
    return this.steps.create(dto, user.id, user.timezone);
  }

  @Get('step-logs')
  listSteps(@CurrentUser() user: CurrentUserPayload, @Query() q: ListStepLogsDto) {
    return this.steps.list(q, user.id);
  }

  @Get('step-logs/by-date/:date')
  stepsForDate(@CurrentUser() user: CurrentUserPayload, @Param('date') date: string) {
    return this.steps.getStepsForDate(date, user.id);
  }

  @Patch('step-logs/:id')
  updateStep(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateStepLogDto,
  ) {
    return this.steps.update(id, dto, user.id);
  }

  @Delete('step-logs/:id')
  deleteStep(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.steps.delete(id, user.id);
  }

  // -------- Progress queries --------
  @Get('progress/weight')
  weightProgress(
    @CurrentUser() user: CurrentUserPayload,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    return this.progress.weightProgress(days ?? 30, { userId: user.id, timezone: user.timezone });
  }

  @Get('progress/strength')
  strengthProgress(
    @CurrentUser() user: CurrentUserPayload,
    @Query('exerciseId', ParseIntPipe) exerciseId: number,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
    @Query('metric') metric?: 'max_weight' | 'estimated_1rm' | 'total_volume',
  ) {
    return this.progress.strengthProgress(exerciseId, days ?? 90, metric ?? 'max_weight', {
      userId: user.id,
      timezone: user.timezone,
    });
  }

  @Get('progress/cardio')
  cardioProgress(
    @CurrentUser() user: CurrentUserPayload,
    @Query('exerciseId', ParseIntPipe) exerciseId: number,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
    @Query('metric') metric?: 'duration' | 'distance' | 'pace' | 'kcal',
  ) {
    return this.progress.cardioProgress(exerciseId, days ?? 90, metric ?? 'duration', {
      userId: user.id,
      timezone: user.timezone,
    });
  }

  @Get('progress/volume')
  volumeProgress(
    @CurrentUser() user: CurrentUserPayload,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
    @Query('muscleGroup') muscleGroup?: string,
  ) {
    return this.progress.volumeProgress(days ?? 90, muscleGroup, {
      userId: user.id,
      timezone: user.timezone,
    });
  }

  @Get('progress/steps')
  stepsProgress(
    @CurrentUser() user: CurrentUserPayload,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    return this.progress.stepsProgress(days ?? 30, {
      userId: user.id,
      timezone: user.timezone,
    });
  }

  // -------- Dashboard --------
  @Get('dashboard/today')
  today(@CurrentUser() user: CurrentUserPayload) {
    return this.dashboard.today({ userId: user.id, timezone: user.timezone });
  }

  @Get('dashboard/week')
  week(@CurrentUser() user: CurrentUserPayload) {
    return this.dashboard.week({ userId: user.id, timezone: user.timezone });
  }
}
