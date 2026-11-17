import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTimezoneTool } from '../../../mcp/tools/meta/update-timezone.tool';
import { UpdateMeDto } from '../update-me.dto';

/**
 * Fuso inválido não entra no perfil (revisão #386): um `User.timezone` ruim
 * fazia a rodada dos avisos de cobrança calcular o dia num fuso que não existe.
 */
describe('UpdateMeDto.timezone', () => {
  const erros = async (timezone: string) =>
    (await validate(plainToInstance(UpdateMeDto, { timezone }))).map((e) => e.property);

  it('aceita fuso IANA', async () => {
    expect(await erros('America/Rio_Branco')).toEqual([]);
    expect(await erros('America/Sao_Paulo')).toEqual([]);
  });

  it('recusa o que não é fuso', async () => {
    expect(await erros('Marte/Olympus')).toEqual(['timezone']);
    expect(await erros('GMT-3 Brasília')).toEqual(['timezone']);
  });
});

describe('MCP update_timezone', () => {
  const montar = () => {
    const update = jest.fn().mockResolvedValue({ id: 'u1', timezone: 'x' });
    const tool = new UpdateTimezoneTool({ user: { update } } as never);
    return { tool, update };
  };

  it('grava fuso IANA', async () => {
    const { tool, update } = montar();
    await tool.execute({ timezone: 'America/Cuiaba' }, { userId: 'u1' } as never);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { timezone: 'America/Cuiaba' } }),
    );
  });

  it('recusa fuso que não existe sem gravar', async () => {
    const { tool, update } = montar();
    await expect(
      tool.execute({ timezone: 'Marte/Olympus' }, { userId: 'u1' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });
});
