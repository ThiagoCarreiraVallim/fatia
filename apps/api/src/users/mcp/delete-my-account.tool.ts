import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { AccountService, DELETE_CONFIRMATION } from '../account.service';

@Injectable()
@McpTool()
export class DeleteMyAccountTool implements McpToolDef {
  constructor(private readonly account: AccountService) {}

  readonly name = 'delete_my_account';

  readonly title = 'Apagar minha conta';

  readonly annotations = { readOnlyHint: false, destructiveHint: true };
  // Única tool de escrita sem exemplo de invocação, por decisão (§Convenções de
  // docs/MCP.md). O input é um literal único, já soletrado abaixo: o exemplo não
  // acrescentaria informação, só uma chamada completa e disparável — sem ID para
  // buscar antes — encerrando a description num template pronto para colar logo
  // depois da frase que manda nunca chamar por iniciativa própria. A isenção
  // está declarada no guarda `tool-catalog.spec.ts`.
  readonly description =
    `Apaga PERMANENTEMENTE a conta do usuário e todos os seus dados: refeições, treinos, peso, passos, hidratação, metas e catálogo custom. É IRREVERSÍVEL e não há backup recuperável pelo usuário. ` +
    `Nunca chame por iniciativa própria nem a partir de uma frase ambígua: confirme com o usuário em texto claro, ofereça export_my_data antes, e só então envie confirmation="${DELETE_CONFIRMATION}".`;
  readonly inputSchema = {
    confirmation: z
      .string()
      .describe(
        `Deve ser exatamente "${DELETE_CONFIRMATION}". Qualquer outro valor é recusado — é a trava contra deleção acidental.`,
      ),
  } as const;

  execute({ confirmation }: { confirmation: string }, { userId }: McpToolContext) {
    return this.account.deleteAccount(userId, confirmation);
  }
}
