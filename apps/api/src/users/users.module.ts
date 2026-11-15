import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { UsersController } from './users.controller';
import { ExportsController } from './exports.controller';
import { AccountService } from './account.service';
import { DataExportService } from './data-export.service';
import { ProfileModule } from './profile.module';
import { ExportMyDataTool } from './mcp/export-my-data.tool';
import { DeleteMyAccountTool } from './mcp/delete-my-account.tool';

@Module({
  imports: [AuthModule, ChatModule, ProfileModule],
  controllers: [UsersController, ExportsController],
  providers: [AccountService, DataExportService, ExportMyDataTool, DeleteMyAccountTool],
  exports: [AccountService],
})
export class UsersModule {}
