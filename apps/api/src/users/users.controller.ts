import { Controller, Get } from '@nestjs/common';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  @Get('me')
  getMe(@CurrentUser() user: CurrentUserPayload) {
    return user;
  }
}
