import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { DataExportService } from './data-export.service';

/**
 * O download do link de exportação (#387). Público de propósito: o link abre no
 * navegador do celular, no app de arquivos e no Claude, onde não há sessão. Quem
 * autoriza é o token de 24 h, que só a dona da conta recebeu.
 */
@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: DataExportService) {}

  @Public()
  @Get(':token')
  // Por IP: a rota não tem login. Dez por minuto bastam para quem baixa, e
  // tornam inútil chutar tokens (32 bytes aleatórios já tornavam).
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async download(@Param('token') token: string, @Res() res: Response) {
    const { filename, body } = await this.exports.download(token);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // O arquivo é dado de saúde: nada de cache no caminho.
    res.setHeader('Cache-Control', 'no-store');
    res.send(JSON.stringify(body, null, 2));
  }
}
