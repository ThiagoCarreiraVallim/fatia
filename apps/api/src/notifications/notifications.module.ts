import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';
import { WebPushService } from './web-push.service';

@Module({
  controllers: [NotificationsController],
  providers: [EmailService, PushService, WebPushService, NotificationService],
  exports: [EmailService, NotificationService],
})
export class NotificationsModule {}
