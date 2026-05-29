import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { WorkoutPlanService } from './workout-plan.service';
import { WorkoutSessionService } from './workout-session.service';
import { SessionSetService } from './session-set.service';
import { ExerciseService } from './exercise.service';
import {
  AddPlanExerciseDto,
  CreatePlanDto,
  ReorderExercisesDto,
  UpdatePlanDto,
  UpdatePlanExerciseDto,
} from './dto/plan.dto';
import {
  FinishSessionDto,
  ListSessionsDto,
  StartSessionDto,
  UpdateSessionDto,
} from './dto/session.dto';
import { LogSetBodyDto, UpdateSetBodyDto } from './dto/set.dto';
import { SearchExercisesDto } from './dto/exercise.dto';
import { CreateCustomExerciseDto, UpdateCustomExerciseDto } from './dto/exercise.dto';

@Controller('workout')
export class WorkoutController {
  constructor(
    private readonly plans: WorkoutPlanService,
    private readonly sessions: WorkoutSessionService,
    private readonly sets: SessionSetService,
    private readonly exercises: ExerciseService,
  ) {}

  // -------- Exercises --------

  @Get('exercises')
  searchExercises(@CurrentUser() user: CurrentUserPayload, @Query() q: SearchExercisesDto) {
    return this.exercises.search(user.id, q);
  }

  @Post('exercises')
  createExercise(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateCustomExerciseDto) {
    return this.exercises.createCustom(user.id, dto);
  }

  @Patch('exercises/:id')
  updateExercise(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomExerciseDto,
  ) {
    return this.exercises.updateCustom(user.id, id, dto);
  }

  @Delete('exercises/:id')
  @HttpCode(204)
  deleteExercise(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
    return this.exercises.deleteCustom(user.id, id);
  }

  // -------- Plans --------

  @Post('plans')
  createPlan(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreatePlanDto) {
    return this.plans.create(user.id, dto);
  }

  @Get('plans')
  listPlans(@CurrentUser() user: CurrentUserPayload) {
    return this.plans.list(user.id);
  }

  @Get('plans/:id')
  getPlan(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.findById(user.id, id);
  }

  @Patch('plans/:id')
  updatePlan(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.plans.update(user.id, id, dto);
  }

  @Delete('plans/:id')
  @HttpCode(204)
  deletePlan(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.delete(user.id, id);
  }

  @Post('plans/:planId/exercises')
  addPlanExercise(
    @CurrentUser() user: CurrentUserPayload,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: AddPlanExerciseDto,
  ) {
    return this.plans.addExercise(user.id, planId, dto);
  }

  @Patch('plans/:planId/exercises/:id')
  updatePlanExercise(
    @CurrentUser() user: CurrentUserPayload,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanExerciseDto,
  ) {
    return this.plans.updatePlanExercise(user.id, planId, id, dto);
  }

  @Delete('plans/:planId/exercises/:id')
  @HttpCode(204)
  removePlanExercise(
    @CurrentUser() user: CurrentUserPayload,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.plans.removeExercise(user.id, planId, id);
  }

  @Put('plans/:planId/exercises/reorder')
  reorderPlanExercises(
    @CurrentUser() user: CurrentUserPayload,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: ReorderExercisesDto,
  ) {
    return this.plans.reorderExercises(user.id, planId, dto);
  }

  // -------- Sessions --------

  @Post('sessions')
  startSession(@CurrentUser() user: CurrentUserPayload, @Body() dto: StartSessionDto) {
    return this.sessions.start(user.id, dto);
  }

  @Get('sessions/active')
  getActiveSession(@CurrentUser() user: CurrentUserPayload) {
    return this.sessions.findActive(user.id);
  }

  @Get('sessions')
  listSessions(@CurrentUser() user: CurrentUserPayload, @Query() q: ListSessionsDto) {
    return this.sessions.list(user.id, q);
  }

  @Get('sessions/:id')
  getSession(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.findById(user.id, id);
  }

  @Patch('sessions/:id')
  updateSession(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessions.update(user.id, id, dto);
  }

  @Post('sessions/:id/finish')
  finishSession(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FinishSessionDto,
  ) {
    return this.sessions.finish(user.id, id, dto);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  deleteSession(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.delete(user.id, id);
  }

  // -------- Sets --------

  @Post('sessions/:sessionId/sets')
  logSet(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: LogSetBodyDto,
  ) {
    return this.sets.create(user.id, { sessionId, ...dto });
  }

  @Patch('sessions/:sessionId/sets/:id')
  updateSet(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSetBodyDto,
  ) {
    return this.sets.update(user.id, id, dto);
  }

  @Delete('sessions/:sessionId/sets/:id')
  @HttpCode(204)
  deleteSet(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.sets.delete(user.id, id);
  }

  // -------- Progress (exercises) --------

  @Get('exercises/:id/last-set')
  getLastSet(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query('before') before?: string,
  ) {
    return this.sets.getLastForExercise(user.id, id, before);
  }

  @Get('exercises/:id/pr')
  getPersonalRecord(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.sets.getPersonalRecord(user.id, id);
  }

  @Get('records')
  listPersonalRecords(@CurrentUser() user: CurrentUserPayload) {
    return this.sets.listPersonalRecords(user.id);
  }
}
