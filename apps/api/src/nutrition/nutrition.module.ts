import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { text } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { NutritionController } from './nutrition.controller';
import { FoodService } from './food.service';
import { MealRecognitionService } from './meal-recognition.service';
import { OffFoodService } from './off-food.service';
import { MealService } from './meal.service';
import { MealItemService } from './meal-item.service';
import { NutritionSummaryService } from './nutrition-summary.service';
import { UserGoalsService } from './user-goals.service';
import { NutrientTargetService } from './nutrient-target.service';
import { SearchFoodTool } from './mcp/search-food.tool';
import { GetFoodTool } from './mcp/get-food.tool';
import { ListFoodGroupsTool } from './mcp/list-food-groups.tool';
import { CreateCustomFoodTool } from './mcp/create-custom-food.tool';
import { UpdateCustomFoodTool } from './mcp/update-custom-food.tool';
import { DeleteCustomFoodTool } from './mcp/delete-custom-food.tool';
import { LogMealTool } from './mcp/log-meal.tool';
import { GetMealTool } from './mcp/get-meal.tool';
import { ListMealsTool } from './mcp/list-meals.tool';
import { UpdateMealTool } from './mcp/update-meal.tool';
import { DeleteMealTool } from './mcp/delete-meal.tool';
import { AddMealItemTool } from './mcp/add-meal-item.tool';
import { UpdateMealItemTool } from './mcp/update-meal-item.tool';
import { DeleteMealItemTool } from './mcp/delete-meal-item.tool';
import { GetNutritionSummaryTool } from './mcp/get-nutrition-summary.tool';
import { GetNutritionHistoryTool } from './mcp/get-nutrition-history.tool';
import { GetNutritionGoalsTool } from './mcp/get-nutrition-goals.tool';
import { SetNutritionGoalsTool } from './mcp/set-nutrition-goals.tool';
import { ListNutrientTargetsTool } from './mcp/list-nutrient-targets.tool';
import { SetNutrientTargetTool } from './mcp/set-nutrient-target.tool';
import { DeleteNutrientTargetTool } from './mcp/delete-nutrient-target.tool';
import { GetNutrientSummaryTool } from './mcp/get-nutrient-summary.tool';

/**
 * Teto do corpo da rota de reconhecimento (#139).
 *
 * A foto é limitada a 4 MB **já decodificada** (`MAX_FOTO_BYTES`); base64 infla
 * um terço, e 6 MB dá a folga do envelope sem virar teto de verdade em lugar
 * nenhum. Quem recusa a foto grande com uma mensagem em português é o serviço,
 * não este parser — um 413 cru do express não diz o que fazer.
 */
const TETO_DA_FOTO_BASE64 = '6mb';

const parseFotoBase64 = text({ type: 'text/plain', limit: TETO_DA_FOTO_BASE64 });

@Module({
  controllers: [NutritionController],
  providers: [
    FoodService,
    MealRecognitionService,
    OffFoodService,
    MealService,
    MealItemService,
    NutritionSummaryService,
    UserGoalsService,
    NutrientTargetService,
    // MCP tools (auto-discovered by McpToolRegistry)
    SearchFoodTool,
    GetFoodTool,
    ListFoodGroupsTool,
    CreateCustomFoodTool,
    UpdateCustomFoodTool,
    DeleteCustomFoodTool,
    LogMealTool,
    GetMealTool,
    ListMealsTool,
    UpdateMealTool,
    DeleteMealTool,
    AddMealItemTool,
    UpdateMealItemTool,
    DeleteMealItemTool,
    GetNutritionSummaryTool,
    GetNutritionHistoryTool,
    GetNutritionGoalsTool,
    SetNutritionGoalsTool,
    ListNutrientTargetsTool,
    SetNutrientTargetTool,
    DeleteNutrientTargetTool,
    GetNutrientSummaryTool,
  ],
  exports: [
    FoodService,
    MealService,
    MealItemService,
    NutritionSummaryService,
    UserGoalsService,
    NutrientTargetService,
  ],
})
export class NutritionModule implements NestModule {
  /**
   * Parser de corpo só para a rota da foto.
   *
   * O parser de JSON registrado por `NestFactory` é global e tem teto de 100 kB.
   * Elevá-lo para caber uma foto elevaria para **todas** as rotas do produto, o
   * que é uma superfície de abuso a mais em troca de nada. `text/plain` atravessa
   * o parser global intocado e é lido aqui, com teto próprio.
   *
   * O casamento é pelo fim do caminho, e não por `forRoutes({ path })`: o
   * `setGlobalPrefix('api')` do `main.ts` não vale para o caminho declarado no
   * consumer, e um path escrito errado não falha — ele simplesmente nunca casa,
   * e o corpo chega vazio na rota, em silêncio.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply((req: Request, res: Response, next: NextFunction) => {
        if (!req.path.endsWith('/meals/recognize')) return next();
        parseFotoBase64(req, res, next);
      })
      .forRoutes(NutritionController);
  }
}
