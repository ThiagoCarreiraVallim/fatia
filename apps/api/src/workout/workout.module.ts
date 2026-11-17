import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { SharedWithService } from '../sharing/shared-with.service';
import { ExerciseService } from './exercise.service';
import { WorkoutPlanService } from './workout-plan.service';
import { WorkoutSessionService } from './workout-session.service';
import { SessionSetService } from './session-set.service';
import { PrescriptionService } from './prescription.service';
import { TrainingBlockService } from './training-block.service';
import { AgendaService } from './agenda.service';
import { ListPlannedSessionsTool } from './mcp/list-planned-sessions.tool';
import { ReschedulePlannedSessionTool } from './mcp/reschedule-planned-session.tool';
import { MuscleSummaryService } from './muscle-summary.service';
import { WorkoutController } from './workout.controller';
import { AddExerciseToPlanTool } from './mcp/add-exercise-to-plan.tool';
import { ExplainFormTool } from './mcp/explain-form.tool';
import { GetExerciseDetailsTool } from './mcp/get-exercise-details.tool';
import { CloneExerciseTool } from './mcp/clone-exercise.tool';
import { CreateCustomExerciseTool } from './mcp/create-custom-exercise.tool';
import { CreateTrainingBlockTool } from './mcp/create-training-block.tool';
import { CreateWorkoutPlanTool } from './mcp/create-workout-plan.tool';
import { DeleteCustomExerciseTool } from './mcp/delete-custom-exercise.tool';
import { DeleteSetTool } from './mcp/delete-set.tool';
import { DeleteTrainingBlockTool } from './mcp/delete-training-block.tool';
import { DeleteWorkoutPlanTool } from './mcp/delete-workout-plan.tool';
import { DeleteWorkoutSessionTool } from './mcp/delete-workout-session.tool';
import { FinishWorkoutSessionTool } from './mcp/finish-workout-session.tool';
import { GetActiveWorkoutSessionTool } from './mcp/get-active-workout-session.tool';
import { GetWeeklyMuscleSummaryTool } from './mcp/get-weekly-muscle-summary.tool';
import { GetLastSetForExerciseTool } from './mcp/get-last-set-for-exercise.tool';
import { GetLoadPrescriptionTool } from './mcp/get-load-prescription.tool';
import { GetPersonalRecordTool } from './mcp/get-personal-record.tool';
import { GetTrainingBlockTool } from './mcp/get-training-block.tool';
import { GetWorkoutPlanTool } from './mcp/get-workout-plan.tool';
import { GetWorkoutSessionTool } from './mcp/get-workout-session.tool';
import { ListExercisesByMuscleTool } from './mcp/list-exercises-by-muscle.tool';
import { ListPersonalRecordsTool } from './mcp/list-personal-records.tool';
import { ListWorkoutPlansTool } from './mcp/list-workout-plans.tool';
import { ListWorkoutSessionsTool } from './mcp/list-workout-sessions.tool';
import { SaveSessionAsPlanTool } from './mcp/save-session-as-plan.tool';
import { LogSetTool } from './mcp/log-set.tool';
import { RemoveExerciseFromPlanTool } from './mcp/remove-exercise-from-plan.tool';
import { ReorderPlanExercisesTool } from './mcp/reorder-plan-exercises.tool';
import { SearchExerciseTool } from './mcp/search-exercise.tool';
import { SetExerciseFavoriteTool } from './mcp/set-exercise-favorite.tool';
import { StartWorkoutSessionTool } from './mcp/start-workout-session.tool';
import { UpdateCustomExerciseTool } from './mcp/update-custom-exercise.tool';
import { UpdatePlanExerciseTool } from './mcp/update-plan-exercise.tool';
import { UpdateSetTool } from './mcp/update-set.tool';
import { UpdateWorkoutPlanTool } from './mcp/update-workout-plan.tool';
import { UpdateWorkoutSessionTool } from './mcp/update-workout-session.tool';

@Module({
  // O tutorial da comunidade (Fase 7b) traz vídeo e fotos com URL assinada.
  imports: [StorageModule],
  controllers: [WorkoutController],
  providers: [
    ExerciseService,
    WorkoutPlanService,
    WorkoutSessionService,
    SessionSetService,
    PrescriptionService,
    TrainingBlockService,
    AgendaService,
    ListPlannedSessionsTool,
    ReschedulePlannedSessionTool,
    MuscleSummaryService,
    // Quem da equipe lê Treino: decide se o fim do treino traz as perguntas
    // (#377). Só depende do Prisma, como no módulo de nutrição.
    SharedWithService,

    // MCP tools
    AddExerciseToPlanTool,
    ExplainFormTool,
    GetExerciseDetailsTool,
    CloneExerciseTool,
    CreateCustomExerciseTool,
    CreateTrainingBlockTool,
    CreateWorkoutPlanTool,
    DeleteCustomExerciseTool,
    DeleteSetTool,
    DeleteTrainingBlockTool,
    DeleteWorkoutPlanTool,
    DeleteWorkoutSessionTool,
    FinishWorkoutSessionTool,
    GetActiveWorkoutSessionTool,
    GetWeeklyMuscleSummaryTool,
    GetLastSetForExerciseTool,
    GetLoadPrescriptionTool,
    GetPersonalRecordTool,
    GetTrainingBlockTool,
    GetWorkoutPlanTool,
    GetWorkoutSessionTool,
    ListExercisesByMuscleTool,
    ListPersonalRecordsTool,
    ListWorkoutPlansTool,
    ListWorkoutSessionsTool,
    SaveSessionAsPlanTool,
    LogSetTool,
    RemoveExerciseFromPlanTool,
    ReorderPlanExercisesTool,
    SearchExerciseTool,
    SetExerciseFavoriteTool,
    StartWorkoutSessionTool,
    UpdateCustomExerciseTool,
    UpdatePlanExerciseTool,
    UpdateSetTool,
    UpdateWorkoutPlanTool,
    UpdateWorkoutSessionTool,
  ],
  exports: [
    ExerciseService,
    WorkoutPlanService,
    WorkoutSessionService,
    SessionSetService,
    PrescriptionService,
    TrainingBlockService,
  ],
})
export class WorkoutModule {}
