import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';

@Module({
  controllers: [NotificationsController],
  providers: [EmailService, PushService, NotificationService],
  exports: [EmailService, NotificationService],
})
export class NotificationsModule {}
