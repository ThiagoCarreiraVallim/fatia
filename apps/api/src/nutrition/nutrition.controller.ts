import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { FoodService } from './food.service';
import { MealService } from './meal.service';
import { MealItemService } from './meal-item.service';
import { NutritionSummaryService } from './nutrition-summary.service';
import { UserGoalsService } from './user-goals.service';
import { CreateCustomFoodDto, SearchFoodDto, UpdateCustomFoodDto } from './dto/food.dto';
import {
  CreateMealDto,
  ListMealsDto,
  MealItemInputDto,
  UpdateMealDto,
  UpdateMealItemDto,
} from './dto/meal.dto';
import { UpsertGoalsDto } from './dto/goals.dto';

@Controller('nutrition')
export class NutritionController {
  constructor(
    private readonly foods: FoodService,
    private readonly meals: MealService,
    private readonly mealItems: MealItemService,
    private readonly summary: NutritionSummaryService,
    private readonly goals: UserGoalsService,
  ) {}

  // -------- Foods --------
  @Get('foods')
  searchFoods(@CurrentUser() user: CurrentUserPayload, @Query() q: SearchFoodDto) {
    return this.foods.search(user.id, q);
  }

  @Get('foods/groups')
  listGroups() {
    return this.foods.listGroups();
  }

  @Get('foods/:id')
  getFood(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
    return this.foods.get(user.id, id);
  }

  @Post('foods')
  createCustomFood(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateCustomFoodDto) {
    return this.foods.createCustom(user.id, dto);
  }

  @Patch('foods/:id')
  updateCustomFood(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomFoodDto,
  ) {
    return this.foods.updateCustom(user.id, id, dto);
  }

  @Delete('foods/:id')
  @HttpCode(204)
  deleteCustomFood(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
    return this.foods.deleteCustom(user.id, id);
  }

  // -------- Meals --------
  @Get('meals')
  listMeals(@CurrentUser() user: CurrentUserPayload, @Query() q: ListMealsDto) {
    return this.meals.list(user.id, q, user.timezone);
  }

  @Post('meals')
  createMeal(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateMealDto) {
    return this.meals.create(user.id, dto);
  }

  @Get('meals/:id')
  getMeal(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.meals.findById(user.id, id);
  }

  @Patch('meals/:id')
  updateMeal(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateMealDto,
  ) {
    return this.meals.update(user.id, id, dto);
  }

  @Delete('meals/:id')
  @HttpCode(204)
  deleteMeal(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.meals.delete(user.id, id);
  }

  // -------- MealItems --------
  @Post('meals/:id/items')
  addItem(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') mealId: string,
    @Body() dto: MealItemInputDto,
  ) {
    return this.mealItems.add(user.id, mealId, dto);
  }

  @Patch('meal-items/:id')
  updateItem(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateMealItemDto,
  ) {
    return this.mealItems.update(user.id, id, dto);
  }

  @Delete('meal-items/:id')
  @HttpCode(204)
  deleteItem(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.mealItems.delete(user.id, id);
  }

  // -------- Summary & Goals --------
  @Get('summary')
  daySummary(@CurrentUser() user: CurrentUserPayload, @Query('date') date: string) {
    return this.summary.getDay(user.id, date, user.timezone);
  }

  @Get('history')
  history(@CurrentUser() user: CurrentUserPayload, @Query('days') daysStr?: string) {
    const days = Math.max(1, Math.min(90, Number(daysStr ?? 7)));
    return this.summary.getHistory(user.id, days, user.timezone);
  }

  @Get('goals')
  getGoals(@CurrentUser() user: CurrentUserPayload) {
    return this.goals.get(user.id);
  }

  @Put('goals')
  upsertGoals(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpsertGoalsDto) {
    return this.goals.upsert(user.id, dto);
  }
}
