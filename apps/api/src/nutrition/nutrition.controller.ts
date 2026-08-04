import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { FoodService } from './food.service';
import { MealRecognitionService } from './meal-recognition.service';
import { OffFoodService, atribuicaoDoOff } from './off-food.service';
import { MealService } from './meal.service';
import { MealItemService } from './meal-item.service';
import { NutritionSummaryService } from './nutrition-summary.service';
import { UserGoalsService } from './user-goals.service';
import { NutrientTargetService } from './nutrient-target.service';
import { CreateCustomFoodDto, SearchFoodDto, UpdateCustomFoodDto } from './dto/food.dto';
import {
  CreateMealDto,
  ListMealsDto,
  MealItemInputDto,
  UpdateMealDto,
  UpdateMealItemDto,
} from './dto/meal.dto';
import { UpsertGoalsDto } from './dto/goals.dto';
import { UpsertNutrientTargetDto } from './dto/nutrient-target.dto';

@Controller('nutrition')
export class NutritionController {
  constructor(
    private readonly foods: FoodService,
    private readonly off: OffFoodService,
    private readonly meals: MealService,
    private readonly mealItems: MealItemService,
    private readonly summary: NutritionSummaryService,
    private readonly goals: UserGoalsService,
    private readonly nutrientTargets: NutrientTargetService,
    private readonly recognition: MealRecognitionService,
  ) {}

  // -------- Reconhecimento por foto (#139) --------

  /**
   * Se a entrada por foto deve aparecer na interface.
   *
   * Existe para que a funcionalidade **suma** onde não há agente configurado, em
   * vez de aparecer e falhar: um botão que sempre erra é pior que um botão que
   * não existe. Sem `@CurrentUser()` porque não lê nada do usuário — a rota
   * continua atrás do guard global de autenticação.
   */
  @Get('photo-recognition')
  async photoRecognitionStatus() {
    return { available: await this.recognition.disponivel() };
  }

  /**
   * Foto de refeição → alimentos candidatos. **Não grava nada.**
   *
   * O corpo é a foto em **base64, com `Content-Type: text/plain`**, e não JSON.
   * O motivo é mecânico: o parser de JSON do Nest é global e tem teto de 100 kB;
   * elevá-lo elevaria para todas as rotas do produto. `text/plain` passa intocado
   * por ele e é parseado por um middleware com teto próprio — ver
   * `nutrition.module.ts`.
   *
   * A resposta é sugestão, não refeição: quem grava é `POST /meals`, depois da
   * tela de confirmação. Ver `meal-recognition.service.ts`.
   */
  @Post('meals/recognize')
  async recognizeMealPhoto(@CurrentUser() user: CurrentUserPayload, @Body() corpo: unknown) {
    if (typeof corpo !== 'string' || corpo.trim() === '') {
      throw new BadRequestException(
        'Envie a foto em base64 no corpo, com Content-Type: text/plain.',
      );
    }

    // `base64` no `Buffer.from` do Node ignora caractere inválido em silêncio, e
    // uma string truncada viraria bytes que não são JPEG — recusados adiante com
    // uma mensagem errada. A validação explícita dá o erro certo.
    if (!/^[A-Za-z0-9+/\s]+={0,2}$/.test(corpo)) {
      throw new BadRequestException('O corpo não é base64 válido.');
    }

    return this.recognition.reconhecer(user.id, Buffer.from(corpo, 'base64'));
  }

  // -------- Foods --------
  @Get('foods')
  searchFoods(@CurrentUser() user: CurrentUserPayload, @Query() q: SearchFoodDto) {
    return this.foods.search(user.id, q);
  }

  @Get('foods/groups')
  listGroups() {
    return this.foods.listGroups();
  }

  /**
   * Consulta um produto embalado pelo código de barras (#140, ADR 017).
   *
   * Sem `@CurrentUser()` de propósito — e não por descuido: a consulta não lê
   * nem escreve nada do usuário, e a rota continua atrás do guard global de
   * autenticação. O que vai para o Open Food Facts é só o código escaneado.
   *
   * O resultado **não é persistido**: o cache em `Food` que a issue previa
   * depende de colunas novas em `schema.prisma`, congelado nesta rodada. A
   * proposta está no corpo da PR.
   */
  @Get('foods/barcode/:code')
  async lookupBarcode(@Param('code') code: string) {
    const resultado = await this.off.lookup(code);

    switch (resultado.status) {
      case 'invalid_barcode':
        throw new BadRequestException('Invalid barcode');
      case 'not_found':
        throw new NotFoundException('Barcode not found');
      case 'unavailable':
        // 503 e não 404: "não respondeu" convida a tentar de novo, "não existe"
        // manda cadastrar à mão um produto que o OFF talvez conheça.
        throw new ServiceUnavailableException('Open Food Facts unavailable');
      default:
        return { ...resultado, attribution: atribuicaoDoOff(code) };
    }
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

  // -------- Nutrient targets (metas personalizadas, ADR 009) --------
  @Get('nutrient-targets')
  listNutrientTargets(@CurrentUser() user: CurrentUserPayload) {
    return this.nutrientTargets.list(user.id);
  }

  @Put('nutrient-targets')
  upsertNutrientTarget(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpsertNutrientTargetDto,
  ) {
    return this.nutrientTargets.upsert(user.id, dto);
  }

  @Delete('nutrient-targets/:key')
  deleteNutrientTarget(@CurrentUser() user: CurrentUserPayload, @Param('key') key: string) {
    return this.nutrientTargets.delete(user.id, key);
  }

  @Get('nutrient-summary')
  nutrientSummary(@CurrentUser() user: CurrentUserPayload, @Query('date') date: string) {
    return this.nutrientTargets.getNutrientSummary(user.id, date, user.timezone);
  }
}
