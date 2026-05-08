import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { NutritionModule } from '../nutrition/nutrition.module';
import { McpController } from './mcp.controller';
import { McpTokensController } from './mcp-tokens.controller';
import { McpTokenService } from './mcp-token.service';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpToolRegistry } from './mcp-tool.registry';
import { GetMeTool } from './tools/meta/get-me.tool';
import { UpdateTimezoneTool } from './tools/meta/update-timezone.tool';
import { ListMyTokensTool } from './tools/meta/list-my-tokens.tool';
import { RevokeTokenTool } from './tools/meta/revoke-token.tool';

@Module({
  imports: [DiscoveryModule, NutritionModule],
  controllers: [McpController, McpTokensController],
  providers: [
    McpTokenService,
    McpAuthGuard,
    McpToolRegistry,
    GetMeTool,
    UpdateTimezoneTool,
    ListMyTokensTool,
    RevokeTokenTool,
  ],
})
export class McpModule {}
