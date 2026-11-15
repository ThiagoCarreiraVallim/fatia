import 'reflect-metadata';
import { z } from 'zod';
import type { NutritionPlanService } from '../../nutrition-plan.service';
import { GetNutritionPlanTool } from '../get-nutrition-plan.tool';
import { AcceptNutritionPlanTool } from '../accept-nutrition-plan.tool';
import { LogPlanMealTool } from '../log-plan-meal.tool';
import { SwapPlanItemTool } from '../swap-plan-item.tool';
import { UndoPlanSwapTool } from '../undo-plan-swap.tool';

/**
 * As cinco tools do plano alimentar (#376): o `userId` e o fuso saem do
 * contexto, nunca do input, e cada uma chama o mesmo método do REST.
 */
describe('tools do plano alimentar', () => {
  const ID = '11111111-2222-4333-8444-555555555555';
  const ID2 = '66666666-7777-4888-8999-000000000000';
  const ctx = { userId: 'user-a', timezone: 'America/Sao_Paulo' };
  const service = {
    overview: jest.fn(async () => ({})),
    accept: jest.fn(async () => ({})),
    logMeal: jest.fn(async () => ({})),
    swap: jest.fn(async () => ({})),
    undoSwap: jest.fn(async () => ({})),
  };
  const plans = service as unknown as NutritionPlanService;

  it('get_nutrition_plan só lê, com o dia opcional', async () => {
    const tool = new GetNutritionPlanTool(plans);
    expect(tool.name).toBe('get_nutrition_plan');
    expect(tool.annotations.readOnlyHint).toBe(true);
    await tool.execute(z.object(tool.inputSchema).parse({ date: '2026-11-15' }), ctx);
    expect(service.overview).toHaveBeenCalledWith('user-a', 'America/Sao_Paulo', '2026-11-15');
  });

  it('accept_nutrition_plan pede confirmação: muda as metas do dia', async () => {
    const tool = new AcceptNutritionPlanTool(plans);
    expect(tool.name).toBe('accept_nutrition_plan');
    expect(tool.annotations).toMatchObject({ readOnlyHint: false, confirmableHint: true });
    await tool.execute(z.object(tool.inputSchema).parse({ planId: ID }), ctx);
    expect(service.accept).toHaveBeenCalledWith('user-a', ID);
  });

  it('log_plan_meal registra a opção escolhida', async () => {
    const tool = new LogPlanMealTool(plans);
    expect(tool.name).toBe('log_plan_meal');
    expect(tool.annotations.readOnlyHint).toBe(false);
    await tool.execute(z.object(tool.inputSchema).parse({ planMealId: ID, optionId: ID2 }), ctx);
    expect(service.logMeal).toHaveBeenCalledWith(
      'user-a',
      ID,
      { optionId: ID2, eatenAt: undefined },
      'America/Sao_Paulo',
    );
  });

  it('swap_plan_item troca pelo equivalente do item', async () => {
    const tool = new SwapPlanItemTool(plans);
    expect(tool.name).toBe('swap_plan_item');
    await tool.execute(z.object(tool.inputSchema).parse({ itemId: ID, equivalentId: ID2 }), ctx);
    expect(service.swap).toHaveBeenCalledWith(
      'user-a',
      { itemId: ID, equivalentId: ID2, date: undefined },
      'America/Sao_Paulo',
    );
  });

  it('undo_plan_swap desfaz a troca', async () => {
    const tool = new UndoPlanSwapTool(plans);
    expect(tool.name).toBe('undo_plan_swap');
    expect(tool.annotations.destructiveHint).toBe(false);
    await tool.execute(z.object(tool.inputSchema).parse({ swapId: ID }), ctx);
    expect(service.undoSwap).toHaveBeenCalledWith('user-a', ID);
  });

  it('nenhuma recebe identidade de usuário por input', () => {
    for (const Tool of [
      GetNutritionPlanTool,
      AcceptNutritionPlanTool,
      LogPlanMealTool,
      SwapPlanItemTool,
      UndoPlanSwapTool,
    ]) {
      const keys = Object.keys(new Tool(plans).inputSchema);
      expect(keys.filter((k) => /user|owner|author/i.test(k))).toEqual([]);
    }
  });
});
