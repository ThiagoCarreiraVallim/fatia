import { Body, Controller, Get, Patch } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateMeDto } from './dto/update-me.dto';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  timezone: true,
  heightCm: true,
} as const;

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  getMe(@CurrentUser() user: CurrentUserPayload) {
    return this.prisma.user.findUnique({ where: { id: user.id }, select: USER_SELECT });
  }

  @Patch('me')
  updateMe(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateMeDto) {
    return this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.heightCm !== undefined && { heightCm: dto.heightCm }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
      },
      select: USER_SELECT,
    });
  }
}
