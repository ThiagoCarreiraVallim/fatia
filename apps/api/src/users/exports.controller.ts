import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { DataExportService } from './data-export.service';
import { ExportTokenThrottlerGuard } from './export-token-throttler.guard';

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
  // Por link, não por IP: atrás do Traefik todo mundo tem o IP do proxy, e o
  // teto por IP virava um balde único para o país inteiro. Chutar tokens já é
  // inútil (32 bytes aleatórios); o teto segura baixas repetidas de um link.
  @UseGuards(ExportTokenThrottlerGuard)
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
