import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { ConsentService } from '../../../sharing/consent.service';
import { escolherPorNome, IntentTool } from '../composicao';
import type { IntentInput } from '../intent-surface';

/**
 * O vínculo pelo nome do profissional (`list_data_sharing`) e o `revoke_data_sharing` dele.
 * Sem nome, só quando há um vínculo — com mais de um, revogar "o" acesso seria escolher pela
 * pessoa.
 */
@Injectable()
@McpTool()
export class StopSharingTool extends IntentTool<'stop_sharing'> {
  constructor(private readonly consent: ConsentService) {
    super('stop_sharing');
  }

  async execute(input: IntentInput<'stop_sharing'>, { userId }: McpToolContext) {
    const vinculos = await this.consent.listMine(userId); // list_data_sharing
    if (vinculos.length === 0)
      throw new NotFoundException('Nenhum profissional tem acesso aos seus dados.');
    let alvo;
    if (input.professional !== undefined) {
      alvo = escolherPorNome(
        input.professional,
        vinculos,
        (v) => v.professionalName,
        'profissional com acesso',
      );
    } else if (vinculos.length === 1) {
      alvo = vinculos[0];
    } else {
      throw new BadRequestException(
        `Mais de um profissional tem acesso (${vinculos.map((v) => v.professionalName).join(', ')}). ` +
          'Diga qual em `professional`.',
      );
    }
    const revogado = await this.consent.revoke(userId, alvo.linkId as string); // revoke_data_sharing
    return { professional: alvo.professionalName, groupName: alvo.groupName, ...revogado };
  }
}
