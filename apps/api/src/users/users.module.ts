import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { AccountService } from './account.service';
import { ExportMyDataTool } from './mcp/export-my-data.tool';
import { DeleteMyAccountTool } from './mcp/delete-my-account.tool';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [AccountService, ExportMyDataTool, DeleteMyAccountTool],
  exports: [AccountService],
})
export class UsersModule {}
