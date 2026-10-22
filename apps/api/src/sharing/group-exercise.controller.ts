import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { RequireGroupAction } from './decorators/require-group-action.decorator';
import {
  CreateGroupExerciseDto,
  EquipmentDto,
  GroupExerciseParamDto,
  GuideDto,
  UpdateGroupExerciseDto,
} from './dto/group-exercise.dto';
import { GroupExerciseService } from './group-exercise.service';
import { GroupRoleGuard } from './guards/group-role.guard';

/**
 * O catálogo de exercícios da comunidade (Fase 7b, ADR 030).
 *
 * `content/exercises` é a bancada da equipe (`content.publish`); `exercises` é
 * a vitrine do membro (`content.read`). O equipamento da academia é do dono
 * (`group.update`). Quem treina encontra os exercícios da comunidade pela busca
 * de sempre (`/workout/exercises`), com eles primeiro.
 */
@Controller('groups/:groupId')
@UseGuards(GroupRoleGuard)
export class GroupExerciseController {
  constructor(private readonly exercises: GroupExerciseService) {}

  // ---- equipe

  @Get('content/exercises')
  @RequireGroupAction('content.publish')
  list(@CurrentUser() user: CurrentUserPayload, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.exercises.listForTeam(user.id, groupId);
  }

  @Get('content/exercises/:exerciseId')
  @RequireGroupAction('content.publish')
  get(@CurrentUser() user: CurrentUserPayload, @Param() p: GroupExerciseParamDto) {
    return this.exercises.getForTeam(user.id, p.groupId, p.exerciseId);
  }

  @Post('content/exercises')
  @RequireGroupAction('content.publish')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateGroupExerciseDto,
  ) {
    return this.exercises.create(user.id, groupId, dto);
  }

  @Patch('content/exercises/:exerciseId')
  @RequireGroupAction('content.publish')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: GroupExerciseParamDto,
    @Body() dto: UpdateGroupExerciseDto,
  ) {
    return this.exercises.update(user.id, p.groupId, p.exerciseId, dto);
  }

  @Put('content/exercises/:exerciseId/guide')
  @RequireGroupAction('content.publish')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  setGuide(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: GroupExerciseParamDto,
    @Body() dto: GuideDto,
  ) {
    return this.exercises.setGuide(user.id, p.groupId, p.exerciseId, dto);
  }

  @Delete('content/exercises/:exerciseId')
  @RequireGroupAction('content.publish')
  remove(@CurrentUser() user: CurrentUserPayload, @Param() p: GroupExerciseParamDto) {
    return this.exercises.remove(user.id, p.groupId, p.exerciseId);
  }

  @Put('equipment')
  @RequireGroupAction('group.update')
  setEquipment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: EquipmentDto,
  ) {
    return this.exercises.setEquipment(user.id, groupId, dto.equipment, dto.customEquipment);
  }

  // ---- membro

  @Get('exercises')
  @RequireGroupAction('content.read')
  memberList(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.exercises.listForMember(user.id, groupId);
  }
}
