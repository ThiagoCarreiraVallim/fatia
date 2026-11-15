import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';
import { WebPushService } from './web-push.service';
import { InboxService } from './inbox.service';
import { ListInboxTool } from './mcp/list-inbox.tool';
import { MarkInboxReadTool } from './mcp/mark-inbox-read.tool';

@Module({
  controllers: [NotificationsController],
  providers: [
    EmailService,
    PushService,
    WebPushService,
    NotificationService,
    InboxService,
    ListInboxTool,
    MarkInboxReadTool,
  ],
  exports: [EmailService, NotificationService, InboxService],
})
export class NotificationsModule {}
