import 'reflect-metadata';
import { getMetadataStorage } from 'class-validator';
import { z } from 'zod';
import { UpdateMealItemDto } from '../../dto/meal.dto';
import type { MealItemService } from '../../meal-item.service';
import { UpdateMealItemTool } from '../update-meal-item.tool';

/**
 * `update_meal_item` aceita o mesmo que o `PATCH` do REST (ADR 006).
 *
 * A tool não aceitava `nutrients`, que o `UpdateMealItemDto` aceita: corrigir a
 * fibra ou o sódio de um item era possível na tela e impossível pelo Claude.
 */
describe('update_meal_item', () => {
  const update = jest.fn(async () => ({ id: 'item-1' }));
  const tool = new UpdateMealItemTool({ update } as unknown as MealItemService);

  it('tem um campo para cada campo do DTO do REST', () => {
    const doDto = new Set(
      getMetadataStorage()
        .getTargetValidationMetadatas(UpdateMealItemDto, '', true, false)
        .map((m) => m.propertyName),
    );
    const daTool = new Set(Object.keys(tool.inputSchema).filter((k) => k !== 'id'));

    expect([...doDto].sort()).toEqual([...daTool].sort());
  });

  it('repassa os micronutrientes ao service', async () => {
    const entrada = z.object(tool.inputSchema).parse({
      id: '11111111-2222-4333-8444-555555555555',
      nutrients: { fiber_g: 3.2, sodium_mg: 410 },
    });

    await tool.execute(entrada, { userId: 'user-a' } as never);

    expect(update).toHaveBeenCalledWith('user-a', '11111111-2222-4333-8444-555555555555', {
      nutrients: { fiber_g: 3.2, sodium_mg: 410 },
    });
  });
});
