import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { WeightLogService } from './weight-log.service';
import { StepLogService } from './step-log.service';
import { ProgressService } from './progress.service';
import { CreateWeightLogDto, ListWeightLogsDto, UpdateWeightLogDto } from './dto/weight-log.dto';
import { CreateStepLogDto, ListStepLogsDto, UpdateStepLogDto } from './dto/step-log.dto';
import {
  CardioProgressQueryDto,
  ProgressQueryDto,
  StrengthProgressQueryDto,
  VolumeProgressQueryDto,
} from './dto/progress-query.dto';

@Controller('weight-logs')
export class WeightLogsController {
  constructor(private readonly weightLogs: WeightLogService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateWeightLogDto) {
    return this.weightLogs.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload, @Query() query: ListWeightLogsDto) {
    return this.weightLogs.list(user.id, query);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateWeightLogDto,
  ) {
    return this.weightLogs.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.weightLogs.delete(user.id, id);
  }
}

@Controller('step-logs')
export class StepLogsController {
  constructor(private readonly stepLogs: StepLogService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateStepLogDto) {
    return this.stepLogs.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload, @Query() query: ListStepLogsDto) {
    return this.stepLogs.list(user.id, query);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateStepLogDto,
  ) {
    return this.stepLogs.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.stepLogs.delete(user.id, id);
  }

  @Get('by-date/:date')
  async getByDate(@CurrentUser() user: CurrentUserPayload, @Param('date') date: string) {
    const steps = await this.stepLogs.getStepsForDate(user.id, date);
    return { date, steps };
  }
}

@Controller('progress')
export class ProgressAnalyticsController {
  constructor(private readonly progress: ProgressService) {}

  @Get('weight')
  weight(@CurrentUser() user: CurrentUserPayload, @Query() query: ProgressQueryDto) {
    return this.progress.weightProgress(user.id, query.days ?? 30, query.timezone ?? 'UTC');
  }

  @Get('strength')
  strength(@CurrentUser() user: CurrentUserPayload, @Query() query: StrengthProgressQueryDto) {
    return this.progress.strengthProgress(
      user.id,
      query.exerciseId,
      query.days ?? 30,
      query.metric ?? '1rm',
      query.timezone ?? 'UTC',
    );
  }

  @Get('cardio')
  cardio(@CurrentUser() user: CurrentUserPayload, @Query() query: CardioProgressQueryDto) {
    return this.progress.cardioProgress(
      user.id,
      query.exerciseId,
      query.days ?? 30,
      query.metric ?? 'duration',
      query.timezone ?? 'UTC',
    );
  }

  @Get('volume')
  volume(@CurrentUser() user: CurrentUserPayload, @Query() query: VolumeProgressQueryDto) {
    return this.progress.volumeProgress(
      user.id,
      query.days ?? 30,
      query.timezone ?? 'UTC',
      query.muscleGroup,
    );
  }

  @Get('steps')
  steps(@CurrentUser() user: CurrentUserPayload, @Query() query: ProgressQueryDto) {
    return this.progress.stepsProgress(user.id, query.days ?? 30, query.timezone ?? 'UTC');
  }
}
