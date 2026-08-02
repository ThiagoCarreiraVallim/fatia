import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { SharingController } from '../sharing.controller';
import { PreviewGroupDto } from '../dto/group.dto';

/**
 * Entrada das rotas de grupo, do lado do pipe.
 *
 * `GET /api/groups/preview` sem `slug` respondia **500**: `@Query('slug')` é
 * primitivo avulso, o `ValidationPipe` global não valida primitivo, e o
 * `undefined` chegava ao `findUnique` do Prisma como
 * `PrismaClientValidationError`. Não há `ExceptionFilter` global em
 * `apps/api/src` que traduza isso — o erro sobe cru como `Internal Server
 * Error`, o que o §A7 do `SUBMISSION_CHECKLIST.md` reprova.
 */

/** As MESMAS opções do `main.ts`. Pipe frouxo aqui provaria outra coisa. */
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

/**
 * O tipo REAL declarado no parâmetro do controller, lido por reflexão.
 *
 * É isto que torna o caso sensível à fiação, e não só ao DTO: se o parâmetro
 * voltar a ser `@Query('slug') slug: string`, o metatype vira `String`, o
 * `ValidationPipe` devolve o valor intocado e o caso fica vermelho. Um teste
 * que instanciasse `PreviewGroupDto` à mão continuaria verde com a rota furada.
 */
function metatypeDoParametro(method: keyof SharingController, index: number): new () => object {
  const types = Reflect.getMetadata('design:paramtypes', SharingController.prototype, method) as
    unknown[] | undefined;
  if (!types) throw new Error(`sem design:paramtypes em ${String(method)}`);
  return types[index] as new () => object;
}

describe('SharingController — validação de entrada', () => {
  describe('GET /groups/preview', () => {
    const metatype = () => metatypeDoParametro('preview', 0);

    it('sem slug para no 400, e não no Prisma', async () => {
      await expect(pipe.transform({}, { type: 'query', metatype: metatype() })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('slug vazio ou curto demais também para no 400', async () => {
      for (const slug of ['', 'ab']) {
        await expect(
          pipe.transform({ slug }, { type: 'query', metatype: metatype() }),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('slug válido atravessa o pipe intacto', async () => {
      // Guarda do guarda: sem isto, um DTO que recusasse TUDO deixaria os casos
      // acima verdes e a rota quebrada.
      const validado = await pipe.transform(
        { slug: 'academia-x' },
        { type: 'query', metatype: metatype() },
      );

      expect(validado).toBeInstanceOf(PreviewGroupDto);
      expect(validado).toEqual({ slug: 'academia-x' });
    });
  });
});
