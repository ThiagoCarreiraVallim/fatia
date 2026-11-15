import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { YouController } from './you.controller';
import { YouService } from './you.service';

@Module({
  imports: [CommonModule],
  controllers: [YouController],
  providers: [YouService],
})
export class YouModule {}
