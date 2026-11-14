import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { checkBrandColor } from '@fatia/design';
import { IsBrandColor, brandColorWarning } from '../is-brand-color';

/**
 * Prova de que a API aplica a mesma regra do editor de marca do painel e do
 * app: o validador chama `checkBrandColor` de @fatia/design, o mesmo código
 * dos clientes. Pronto para o DTO de atualização da comunidade (#372).
 */
class UpdateBrandDto {
  @IsBrandColor()
  brandColor!: string;
}

async function errorsFor(value: unknown): Promise<string[]> {
  const dto = plainToInstance(UpdateBrandDto, { brandColor: value });
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('@IsBrandColor()', () => {
  it('aceita o laranja padrão', async () => {
    expect(await errorsFor('#FF7A1A')).toEqual([]);
  });

  it('aceita cor sem contraste (o aviso é do editor, não um bloqueio)', async () => {
    expect(await errorsFor('#7C5CFF')).toEqual([]);
  });

  it.each(['#2CE500', '#2EE600', '#5CFF2E'])('recusa o verde do Fatia (%s)', async (cor) => {
    const errors = await errorsFor(cor);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/verde do Fatia/);
  });

  it.each(['laranja', '#ff7a1', 42, null])('recusa valor que não é cor hex (%s)', async (v) => {
    const errors = await errorsFor(v);
    expect(errors[0]).toMatch(/hexadecimal/);
  });

  it('dá o mesmo veredito que o cliente', async () => {
    for (const cor of ['#FF7A1A', '#2CE500', '#1D4ED8', '#7C5CFF', '#00FF00']) {
      const client = checkBrandColor(cor).status === 'rejected';
      expect((await errorsFor(cor)).length > 0).toBe(client);
    }
  });
});

describe('brandColorWarning', () => {
  it('devolve o aviso com a sugestão para cor sem contraste', () => {
    const w = brandColorWarning('#7C5CFF');
    expect(w?.suggestion).toMatch(/^#[0-9a-f]{6}$/);
    expect(w?.message).toMatch(/4,5:1/);
  });

  it('cor boa não tem aviso', () => {
    expect(brandColorWarning('#FF7A1A')).toBeNull();
  });
});
