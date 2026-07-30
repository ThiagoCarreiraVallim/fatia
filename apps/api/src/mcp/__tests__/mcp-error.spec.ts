import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { categorizeError, formatToolError } from '../mcp-error';

describe('categorizeError', () => {
  it('mapeia exceptions Nest para as categorias da §Erros de docs/MCP.md', () => {
    expect(categorizeError(new BadRequestException('grams inválido')).category).toBe(
      'INVALID_INPUT',
    );
    expect(categorizeError(new UnauthorizedException()).category).toBe('UNAUTHORIZED');
    expect(categorizeError(new ForbiddenException()).category).toBe('UNAUTHORIZED');
    expect(categorizeError(new NotFoundException('Meal not found')).category).toBe('NOT_FOUND');
    expect(categorizeError(new ConflictException('sessão já finalizada')).category).toBe(
      'CONFLICT',
    );
    expect(categorizeError(new InternalServerErrorException()).category).toBe('INTERNAL');
  });

  it('preserva a mensagem da exception Nest', () => {
    expect(categorizeError(new NotFoundException('Meal not found')).message).toBe('Meal not found');
  });

  it('junta as mensagens quando a exception carrega um array (ValidationPipe)', () => {
    const err = new BadRequestException({ message: ['grams must be positive', 'mealId invalid'] });
    expect(categorizeError(err).message).toBe('grams must be positive; mealId invalid');
  });

  it('detalha o campo em erro de Zod', () => {
    const schema = z.object({ grams: z.number().positive() });
    const result = schema.safeParse({ grams: -1 });
    if (result.success) throw new Error('esperava falha de validação');

    const { category, message } = categorizeError(result.error);
    expect(category).toBe('INVALID_INPUT');
    expect(message).toContain('grams');
  });

  it('mapeia violação de unicidade do Prisma para CONFLICT citando os campos', () => {
    const err = new Prisma.PrismaClientKnownRequestError('unique failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['userId', 'nutrientKey'] },
    });

    const { category, message } = categorizeError(err);
    expect(category).toBe('CONFLICT');
    expect(message).toContain('userId, nutrientKey');
  });

  it('mapeia registro ausente e FK inválida do Prisma', () => {
    const missing = new Prisma.PrismaClientKnownRequestError('not found', {
      code: 'P2025',
      clientVersion: 'test',
    });
    const badFk = new Prisma.PrismaClientKnownRequestError('fk failed', {
      code: 'P2003',
      clientVersion: 'test',
    });

    expect(categorizeError(missing).category).toBe('NOT_FOUND');
    expect(categorizeError(badFk).category).toBe('INVALID_INPUT');
  });

  it('cai em INTERNAL para erro desconhecido', () => {
    expect(categorizeError(new Error('boom')).category).toBe('INTERNAL');
    expect(categorizeError('string solta').category).toBe('INTERNAL');
  });
});

describe('formatToolError', () => {
  it('entrega categoria, causa e o que fazer a seguir', () => {
    const { category, text } = formatToolError(new NotFoundException('Meal not found'));

    expect(category).toBe('NOT_FOUND');
    expect(text).toContain('[NOT_FOUND]');
    expect(text).toContain('Meal not found');
    // A dica é o que permite o Claude se recuperar sem intervenção do usuário.
    expect(text).toContain('tool de listagem');
  });

  it('orienta a não repetir automaticamente em erro interno', () => {
    expect(formatToolError(new Error('boom')).text).toContain('Não repita automaticamente');
  });
});
