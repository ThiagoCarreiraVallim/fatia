import { z } from 'zod';

/**
 * Os campos do alimento próprio que a #375 trouxe, iguais em `create_custom_food`
 * e `update_custom_food`. O `FoodService` confere de novo (teto por 100 g).
 */
export const NUTRIENTS_SCHEMA = z
  .record(z.string().regex(/^[a-z0-9_]{1,40}$/), z.number().min(0))
  .describe(
    'Micronutrientes por 100 g, chave com a unidade no fim (fiber_g, sodium_mg, sugar_g, ' +
      'saturated_fat_g, calcium_mg). Use as chaves de list_nutrient_targets quando houver',
  );

export const BARCODE_SCHEMA = z
  .string()
  .regex(/^\d{8,14}$/)
  .describe(
    'Código de barras da embalagem (EAN/UPC, só dígitos), só se o usuário pedir para ligar; ' +
      'único entre os alimentos dele',
  );
