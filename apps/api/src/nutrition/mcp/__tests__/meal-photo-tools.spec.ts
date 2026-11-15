import type { MealService } from '../../meal.service';
import { DeleteMealPhotoTool } from '../delete-meal-photo.tool';
import { LogMealTool } from '../log-meal.tool';

const CTX = { userId: 'user-A' } as never;
const MEAL_ID = '11111111-2222-4333-8444-555555555555';

describe('tools da foto e da origem (#374)', () => {
  it('delete_meal_photo apaga só a foto da refeição de quem chama e não devolve arquivo', async () => {
    const deletePhoto = jest.fn().mockResolvedValue({ id: MEAL_ID, hasPhoto: false, items: [] });
    const tool = new DeleteMealPhotoTool({ deletePhoto } as unknown as MealService);

    const out = await tool.execute({ id: MEAL_ID }, CTX);

    expect(deletePhoto).toHaveBeenCalledWith('user-A', MEAL_ID);
    expect(out).toEqual({ mealId: MEAL_ID, hasPhoto: false });
    expect(tool.annotations.destructiveHint).toBe(true);
  });

  it('log_meal marca o item como da IA quando a origem não vem, e respeita a que vem', async () => {
    const create = jest.fn().mockResolvedValue({});
    const tool = new LogMealTool({ create } as unknown as MealService);

    await tool.execute(
      {
        mealType: 'LUNCH',
        eatenAt: '2026-11-15T12:00:00-03:00',
        items: [
          { foodName: 'Prato', grams: 300, kcal: 500 },
          { foodId: 1, grams: 50, source: 'BARCODE' },
        ],
      },
      CTX,
    );

    expect(create.mock.calls[0][1].items.map((i: { source: string }) => i.source)).toEqual([
      'AI',
      'BARCODE',
    ]);
  });
});
