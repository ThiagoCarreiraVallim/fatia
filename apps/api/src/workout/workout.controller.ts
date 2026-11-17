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
import { CircuitSessionService } from './circuit-session.service';
import { CircuitProgressDto, FinishCircuitDto, SaveCircuitDto } from './dto/circuit.dto';
import { SessionSetService } from './session-set.service';
import { ExerciseService } from './exercise.service';
import { PrescriptionService } from './prescription.service';
import { TrainingBlockService } from './training-block.service';
import { AgendaService } from './agenda.service';
import { AgendaQueryDto, RescheduleSessionDto } from './dto/agenda.dto';
import { MuscleSummaryService } from './muscle-summary.service';
import { CreateTrainingBlockDto, TrainingBlockPreviewDto } from './dto/training-block.dto';
import {
  AddPlanExerciseDto,
  AddPlanExercisesDto,
  CreatePlanDto,
  ReorderExercisesDto,
  UpdatePlanDto,
  UpdatePlanExerciseDto,
} from './dto/plan.dto';
import {
  FinishSessionDto,
  HistoryQueryDto,
  ListSessionsDto,
  SaveSessionAsPlanDto,
  StartSessionDto,
  UpdateSessionDto,
  WorkoutCheckinDto,
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
    private readonly prescriptions: PrescriptionService,
    private readonly blocks: TrainingBlockService,
    private readonly muscles: MuscleSummaryService,
    private readonly agenda: AgendaService,
    private readonly circuits: CircuitSessionService,
  ) {}

  // -------- Circuitos (#380, Al-T22 e Al-T4) --------

  /** "Novo circuito": nome, formato e exercícios de uma vez. A lista é a de planos (`kind`). */
  @Post('circuits')
  createCircuit(@CurrentUser() user: CurrentUserPayload, @Body() dto: SaveCircuitDto) {
    return this.plans.createCircuit(user.id, dto);
  }

  /** Editar o circuito: tudo substituído. */
  @Put('circuits/:id')
  replaceCircuit(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveCircuitDto,
  ) {
    return this.plans.replaceCircuit(user.id, id, dto);
  }

  /** Os toques do circuito em andamento, para retomar em outra aba ou aparelho. */
  @Put('sessions/:id/circuit')
  saveCircuitProgress(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CircuitProgressDto,
  ) {
    return this.circuits.saveProgress(user.id, id, dto.events);
  }

  /** "Encerrar circuito": resultado, séries e fim da sessão. Leva ao "Treino feito". */
  @Post('sessions/:id/circuit/finish')
  finishCircuit(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FinishCircuitDto,
  ) {
    return this.circuits.finish(user.id, id, dto);
  }

  // -------- Agenda de treinos (#379, Al-T24) --------

  /** Os dias do intervalo, com as sessões do plano de calendário. Informativa (ADR 042). */
  @Get('agenda')
  agendaRange(@CurrentUser() user: CurrentUserPayload, @Query() q: AgendaQueryDto) {
    return this.agenda.range(user.id, user.timezone, q.from, q.to);
  }

  /** "Remarcar": de hoje até o fim do plano. Não reserva nada. */
  @Patch('agenda/:id')
  reschedule(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleSessionDto,
  ) {
    return this.agenda.reschedule(user.id, user.timezone, id, dto.date);
  }

  // -------- Blocos de periodização (#145) --------

  @Post('blocks')
  createBlock(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateTrainingBlockDto) {
    return this.blocks.create({ userId: user.id, timezone: user.timezone }, dto);
  }

  @Get('blocks/active')
  getActiveBlock(@CurrentUser() user: CurrentUserPayload) {
    return this.blocks.getActive({ userId: user.id, timezone: user.timezone });
  }

  /** As semanas do bloco antes de criar (Al-T12, #379). */
  @Get('blocks/preview')
  previewBlock(@CurrentUser() user: CurrentUserPayload, @Query() q: TrainingBlockPreviewDto) {
    return this.blocks.preview({ userId: user.id, timezone: user.timezone }, q);
  }

  /** O bloco mais recente, em qualquer estado (Al-T12, #379). */
  @Get('blocks/latest')
  latestBlock(@CurrentUser() user: CurrentUserPayload) {
    return this.blocks.latest({ userId: user.id, timezone: user.timezone });
  }

  @Delete('blocks/:id')
  @HttpCode(204)
  deleteBlock(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.blocks.abandon({ userId: user.id, timezone: user.timezone }, id);
  }

  // -------- Exercises --------

  /** O equipamento das academias da pessoa, para o editor de exercício. */
  @Get('equipment')
  gymEquipment(@CurrentUser() user: CurrentUserPayload) {
    return this.exercises.gymEquipment(user.id);
  }

  @Get('exercises')
  searchExercises(@CurrentUser() user: CurrentUserPayload, @Query() q: SearchExercisesDto) {
    return this.exercises.search(user.id, q);
  }

  /** A aba Favoritos do "Adicionar exercício" (#378) — antes de `exercises/:id`. */
  @Get('exercises/favorites')
  listFavoriteExercises(@CurrentUser() user: CurrentUserPayload) {
    return this.exercises.listFavorites(user.id);
  }

  @Put('exercises/:id/favorite')
  @HttpCode(204)
  favoriteExercise(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
    return this.exercises.setFavorite(user.id, id, true);
  }

  @Delete('exercises/:id/favorite')
  @HttpCode(204)
  unfavoriteExercise(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.exercises.setFavorite(user.id, id, false);
  }

  @Get('exercises/:id')
  getExercise(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
    return this.exercises.getWithMedia(user.id, id);
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

  // Cria (ou reaproveita) uma cópia editável de um exercício base. Aceita overrides
  // opcionais no body (editar já no clone). A base some das listagens do usuário.
  @Post('exercises/:id/clone')
  cloneExercise(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomExerciseDto,
  ) {
    return this.exercises.cloneForEdit(user.id, id, dto);
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

  /** Seleção múltipla (Al-T8): vários exercícios no fim do plano, numa escrita só. */
  @Post('plans/:planId/exercises/batch')
  addPlanExercises(
    @CurrentUser() user: CurrentUserPayload,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: AddPlanExercisesDto,
  ) {
    return this.plans.addExercises(user.id, planId, dto);
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

  /**
   * Séries por grupo nos últimos 7 dias, os grupos descansados e um plano que
   * os trabalha: os cards da aba Treino (#369). Derivado, não guarda nada.
   */
  @Get('muscles/week')
  weeklyMuscles(@CurrentUser() user: CurrentUserPayload) {
    return this.muscles.weekly(user.id, user.timezone);
  }

  /** O histórico (#381, Al-T10): totais e linhas das sessões concluídas, com filtro por tipo. */
  @Get('history')
  history(@CurrentUser() user: CurrentUserPayload, @Query() q: HistoryQueryDto) {
    return this.sessions.history(user.id, q);
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

  /** O "Treino feito!" (#377): resumo, recordes, músculos e as perguntas da equipe. */
  @Get('sessions/:id/summary')
  sessionSummary(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.summary(user.id, id);
  }

  /** "Salvar como plano" (#381, Al-T11b): um plano novo com as metas observadas na sessão. */
  @Post('sessions/:id/plan')
  saveSessionAsPlan(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveSessionAsPlanDto,
  ) {
    return this.plans.createFromSession(user.id, id, dto);
  }

  /** As respostas do fim do treino (#377). PUT: reenviar substitui, não duplica. */
  @Put('sessions/:id/checkin')
  saveCheckin(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WorkoutCheckinDto,
  ) {
    return this.sessions.saveCheckin(user.id, id, dto);
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

  // A série fica presa à sessão da URL: `sessionId` de uma sessão e `id` de
  // série de outra (mesmo as duas sendo da pessoa) dão 404.
  @Patch('sessions/:sessionId/sets/:id')
  updateSet(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSetBodyDto,
  ) {
    return this.sets.update(user.id, id, dto, sessionId);
  }

  @Delete('sessions/:sessionId/sets/:id')
  @HttpCode(204)
  deleteSet(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sets.delete(user.id, id, sessionId);
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

  /** "Seus números" do Como fazer (#377): recorde, última vez e máximo estimado. */
  @Get('exercises/:id/stats')
  exerciseStats(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
    return this.sets.exerciseStats(user.id, id);
  }

  @Get('exercises/:id/pr')
  getPersonalRecord(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.sets.getPersonalRecord(user.id, id);
  }

  /**
   * Prescrição da próxima série. `targetReps` vem do plano, que o app já tem em
   * mãos — pedir de volta à API custaria uma consulta para descobrir algo que o
   * chamador acabou de ler.
   */
  @Get('exercises/:id/prescription')
  getPrescription(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query('targetReps') targetReps?: string,
  ) {
    return this.prescriptions.forExercise(user.id, id, targetReps);
  }

  @Get('records')
  listPersonalRecords(@CurrentUser() user: CurrentUserPayload) {
    return this.sets.listPersonalRecords(user.id);
  }
}
