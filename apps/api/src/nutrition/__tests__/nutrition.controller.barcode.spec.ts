import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { NutritionController } from '../nutrition.controller';
import type { OffFoodService, ResultadoDaConsulta } from '../off-food.service';

/**
 * A tradução do resultado da consulta em status HTTP é contrato de UI, não
 * detalhe: o app distingue "cadastre este produto" (404) de "tente de novo"
 * (503) pelo status, e trocar um pelo outro manda a pessoa preencher um
 * formulário inteiro só porque o Open Food Facts piscou.
 */
function controller(resultado: ResultadoDaConsulta): {
  ctrl: NutritionController;
  off: { lookup: jest.Mock };
} {
  const off = { lookup: jest.fn().mockResolvedValue(resultado) };
  const nada = null as never;
  const ctrl = new NutritionController(
    nada,
    off as unknown as OffFoodService,
    nada,
    nada,
    nada,
    nada,
    nada,
  );
  return { ctrl, off };
}

describe('NutritionController — GET foods/barcode/:code', () => {
  it('devolve o produto com a atribuição da ODbL junto', async () => {
    const { ctrl } = controller({
      status: 'ok',
      product: {
        barcode: '7891000100103',
        name: 'Leite Condensado Integral moça',
        brand: 'Nestlé',
        basis: '100g',
        kcalPer100g: 325,
        proteinPer100g: 7,
        carbsPer100g: 55,
        fatPer100g: 8,
        servingSize: 20,
        servingLabel: '20 g',
      },
    });

    const resposta = await ctrl.lookupBarcode('7891000100103');

    expect(resposta).toMatchObject({
      status: 'ok',
      attribution: {
        source: 'Open Food Facts',
        license: 'ODbL 1.0',
        url: 'https://world.openfoodfacts.org/product/7891000100103',
      },
    });
  });

  it('ficha incompleta é 200 com o que falta, não erro', async () => {
    // É resultado útil: o app abre o cadastro manual já preenchido. Devolver
    // erro aqui jogaria fora o nome e os macros que vieram.
    const { ctrl } = controller({
      status: 'incomplete',
      missing: ['proteinPer100g'],
      partial: { barcode: '7891910000197', basis: '100g', name: 'União Refinado' },
    });

    const resposta = await ctrl.lookupBarcode('7891910000197');

    expect(resposta).toMatchObject({ status: 'incomplete', missing: ['proteinPer100g'] });
  });

  it('código não cadastrado no OFF vira 404', async () => {
    const { ctrl } = controller({ status: 'not_found' });
    await expect(ctrl.lookupBarcode('7891962057014')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('código malformado vira 400', async () => {
    const { ctrl } = controller({ status: 'invalid_barcode' });
    await expect(ctrl.lookupBarcode('abc')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('OFF fora do ar vira 503, e não 404', async () => {
    // 404 aqui mandaria a pessoa cadastrar à mão um produto que o OFF conhece.
    const { ctrl } = controller({ status: 'unavailable' });
    await expect(ctrl.lookupBarcode('7891000100103')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('repassa o código como veio, sem nada do usuário', async () => {
    const { ctrl, off } = controller({ status: 'not_found' });
    await expect(ctrl.lookupBarcode('7891000100103')).rejects.toBeInstanceOf(NotFoundException);
    expect(off.lookup).toHaveBeenCalledWith('7891000100103');
    expect(off.lookup).toHaveBeenCalledTimes(1);
  });
});
