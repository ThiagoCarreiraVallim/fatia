import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { WaterLogService } from '../water-log.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class DeleteWaterLogTool implements McpToolDef {
  constructor(private readonly waters: WaterLogService) {}
  readonly name = 'delete_water_log';
  readonly description = 'Remove um log de água.';
  readonly inputSchema = { id: z.string() } as const;
  async execute({ id }: { id: string }, { userId }: McpToolContext) {
    return this.waters.delete(id, userId);
  }
}
