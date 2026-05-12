import { Module } from '@nestjs/common';
import { WeightLogService } from './weight-log.service';
import { StepLogService } from './step-log.service';
import { ProgressService } from './progress.service';

@Module({
  providers: [WeightLogService, StepLogService, ProgressService],
  exports: [WeightLogService, StepLogService, ProgressService],
})
export class ProgressModule {}
