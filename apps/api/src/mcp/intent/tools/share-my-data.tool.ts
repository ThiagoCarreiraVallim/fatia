import { Injectable } from '@nestjs/common';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { ConsentService } from '../../../sharing/consent.service';
import { escolherPorNome, IntentTool } from '../composicao';
import type { IntentInput } from '../intent-surface';

/**
 * Somar em vez de substituir: `grant_data_sharing` troca a lista inteira de categorias, e
 * liberar a nutrição mandando só `NUTRITION` revogaria o treino que o profissional já via —
 * a armadilha que `share-liberar` mede no braço A. Aqui a lista enviada é a união da atual
 * (`list_data_sharing`) com a pedida. RESTRICTED como a perna: o chat não a oferece.
 */
@Injectable()
@McpTool()
export class ShareMyDataTool extends IntentTool<'share_my_data'> {
  constructor(private readonly consent: ConsentService) {
    super('share_my_data');
  }

  async execute(input: IntentInput<'share_my_data'>, { userId }: McpToolContext) {
    const vinculos = await this.consent.listMine(userId); // list_data_sharing
    const alvo = escolherPorNome(
      input.professional,
      vinculos,
      (v) => v.professionalName,
      'profissional vinculado',
    );
    const scopes = [...new Set([...alvo.scopes, ...input.scopes])];
    return this.consent.grant(userId, alvo.professionalMembershipId, scopes); // grant_data_sharing
  }
}
