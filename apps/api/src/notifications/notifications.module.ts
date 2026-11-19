import { Module } from '@nestjs/common';
import { AnnouncementEmailController } from './announcement-email.controller';
import { AnnouncementEmailService } from './announcement-email.service';
import { EmailService } from './email.service';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';
import { WebPushService } from './web-push.service';
import { InboxService } from './inbox.service';
import { ListInboxTool } from './mcp/list-inbox.tool';
import { MarkInboxReadTool } from './mcp/mark-inbox-read.tool';
import { GetNotificationSettingsTool } from './mcp/get-notification-settings.tool';
import { UpdateNotificationSettingsTool } from './mcp/update-notification-settings.tool';
import { ReminderService } from './reminders/reminder.service';
import { ReminderJob } from './reminders/reminder-job.service';
import { RemindersController } from './reminders/reminders.controller';
import { ListRemindersTool } from './reminders/mcp/list-reminders.tool';
import { CreateReminderTool } from './reminders/mcp/create-reminder.tool';
import { UpdateReminderTool } from './reminders/mcp/update-reminder.tool';
import { DeleteReminderTool } from './reminders/mcp/delete-reminder.tool';

@Module({
  controllers: [NotificationsController, RemindersController, AnnouncementEmailController],
  providers: [
    EmailService,
    AnnouncementEmailService,
    PushService,
    WebPushService,
    NotificationService,
    InboxService,
    ListInboxTool,
    MarkInboxReadTool,
    GetNotificationSettingsTool,
    UpdateNotificationSettingsTool,
    // Lembretes pessoais (#389).
    ReminderService,
    ReminderJob,
    ListRemindersTool,
    CreateReminderTool,
    UpdateReminderTool,
    DeleteReminderTool,
  ],
  exports: [EmailService, AnnouncementEmailService, NotificationService, InboxService],
})
export class NotificationsModule {}
