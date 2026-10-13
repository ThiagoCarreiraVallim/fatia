import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FoodShortcutsService } from '../food-shortcuts.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class SetFoodFavoriteTool implements McpToolDef {
  constructor(private readonly shortcuts: FoodShortcutsService) {}
  readonly name = 'set_food_favorite';
  readonly title = 'Favoritar alimento';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Marca ou desmarca um alimento como favorito; favoritos aparecem primeiro na busca do app. ' +
    'Exemplo: {"id":312,"favorite":true}';
  readonly inputSchema = {
    id: z.number().int().describe('ID do alimento, obtido via search_food ou list_my_foods'),
    favorite: z.boolean().describe('true marca, false desmarca'),
  } as const;
  async execute({ id, favorite }: { id: number; favorite: boolean }, { userId }: McpToolContext) {
    await this.shortcuts.setFavorite(userId, id, favorite);
    return { id, favorite };
  }
}
