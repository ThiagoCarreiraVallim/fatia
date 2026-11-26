import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { GoalsService } from './goals.service';
import { CreateGoalDto, ListGoalsDto, UpdateGoalDto } from './dto/goal.dto';

@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateGoalDto) {
    return this.goals.create(dto, user.id, user.timezone);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload, @Query() q: ListGoalsDto) {
    return this.goals.list(q, user.id, user.timezone);
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.goals.findById(id, user.id, user.timezone);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.goals.update(id, dto, user.id, user.timezone);
  }

  @Post(':id/complete')
  complete(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.goals.complete(id, user.id, user.timezone);
  }

  @Delete(':id')
  delete(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.goals.delete(id, user.id);
  }
}
