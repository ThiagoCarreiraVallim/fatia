import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@fatia/db';

/**
 * `MealItem.seq` só ordena (ver `ITENS_EM_ORDEM`): é um contador global, e devolvê-lo seria pôr
 * na resposta — e no contexto do modelo, pelo `/mcp` — um número que não diz nada a ninguém.
 */
const OPCOES = { omit: { mealItem: { seq: true } } } as const;

@Injectable()
export class PrismaService
  extends PrismaClient<typeof OPCOES>
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super(OPCOES);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
