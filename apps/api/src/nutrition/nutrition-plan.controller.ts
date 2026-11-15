import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { NutritionPlanService } from './nutrition-plan.service';
import {
  AcceptNutritionPlanDto,
  LogPlanMealDto,
  NutritionPlanQueryDto,
  SwapPlanItemDto,
} from './dto/nutrition-plan.dto';

/**
 * Plano alimentar do profissional, lado do aluno (#376, prancha Al-N5). Só o
 * próprio aluno: nenhuma rota recebe `userId`, e todo id de entrada é
 * procurado dentro do plano dele.
 */
@Controller('nutrition/plan')
export class NutritionPlanController {
  constructor(private readonly plans: NutritionPlanService) {}

  @Get()
  overview(@CurrentUser() user: CurrentUserPayload, @Query() q: NutritionPlanQueryDto) {
    return this.plans.overview(user.id, user.timezone, q.date);
  }

  @Post('accept')
  @HttpCode(200)
  accept(@CurrentUser() user: CurrentUserPayload, @Body() dto: AcceptNutritionPlanDto) {
    return this.plans.accept(user.id, dto.planId);
  }

  @Post('meals/:id/log')
  logMeal(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LogPlanMealDto,
  ) {
    return this.plans.logMeal(user.id, id, dto, user.timezone);
  }

  @Post('swaps')
  swap(@CurrentUser() user: CurrentUserPayload, @Body() dto: SwapPlanItemDto) {
    return this.plans.swap(user.id, dto, user.timezone);
  }

  @Delete('swaps/:id')
  undoSwap(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.plans.undoSwap(user.id, id);
  }
}
