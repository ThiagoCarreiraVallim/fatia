import { Module } from '@nestjs/common';
import { NutritionController } from './nutrition.controller';
import { FoodService } from './food.service';
import { MealService } from './meal.service';
import { MealItemService } from './meal-item.service';
import { NutritionSummaryService } from './nutrition-summary.service';
import { UserGoalsService } from './user-goals.service';
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

@Module({
  controllers: [NutritionController],
  providers: [
    FoodService,
    MealService,
    MealItemService,
    NutritionSummaryService,
    UserGoalsService,
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
  ],
  exports: [FoodService, MealService, MealItemService, NutritionSummaryService, UserGoalsService],
})
export class NutritionModule {}
