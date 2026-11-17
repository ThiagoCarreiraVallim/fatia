import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { apiPublicUrl } from '../common/public-url';
import { AccountService } from './account.service';

/** Validade do link de exportação (prancha Al-V1: "Arquivo com link, vale 24 h"). */
export const EXPORT_LINK_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * Depois da primeira baixa, o link dura só mais isto: dá para tentar de novo se
 * a rede caiu, mas um link que vazou (histórico, print, log) não vale o dia todo.
 */
export const EXPORT_LINK_REDOWNLOAD_MS = 15 * 60 * 1000;

const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');

export interface ExportLink {
  url: string;
  expiresAt: Date;
}

/**
 * Exportação por link (LGPD art. 18, V; #387). O pedido devolve um link que
 * vale 24 h e abre sem login — o navegador, o app de arquivos do celular e o
 * Claude abrem igual. Por isso o token é segredo de uso: só o hash fica no
 * banco, como no convite de comunidade.
 *
 * O arquivo é montado na hora do download, a partir do mesmo
 * `AccountService.exportData`: nenhuma cópia dos dados fica parada no servidor
 * ou no bucket esperando alguém baixar, e a instância sem bucket (self-host)
 * exporta igual.
 */
@Injectable()
export class DataExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly account: AccountService,
  ) {}

  async createLink(userId: string, now = new Date()): Promise<ExportLink> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + EXPORT_LINK_TTL_MS);
    // Os links vencidos da pessoa saem aqui: a tabela não acumula.
    await this.prisma.dataExport.deleteMany({ where: { userId, expiresAt: { lt: now } } });
    await this.prisma.dataExport.create({
      data: { userId, tokenHash: hashOf(token), expiresAt, createdAt: now },
    });
    return { url: `${apiPublicUrl()}/api/exports/${token}`, expiresAt };
  }

  /**
   * O arquivo do link. Token desconhecido é 404; vencido é 410 — a pessoa
   * entende "peça outro" em vez de achar que o link nunca existiu.
   */
  async download(
    token: string,
    now = new Date(),
  ): Promise<{ filename: string; body: Awaited<ReturnType<AccountService['exportData']>> }> {
    const link = await this.prisma.dataExport.findUnique({ where: { tokenHash: hashOf(token) } });
    if (!link) throw new NotFoundException('Link de exportação não encontrado.');
    if (link.expiresAt <= now) {
      throw new GoneException('Este link venceu. Peça uma nova exportação no app.');
    }
    const body = await this.account.exportData(link.userId, { photoLinks: true });
    // A janela conta da primeira baixa; as seguintes não a esticam.
    const firstDownload = link.downloadedAt ?? now;
    const cutoff = new Date(firstDownload.getTime() + EXPORT_LINK_REDOWNLOAD_MS);
    await this.prisma.dataExport.update({
      where: { id: link.id },
      data: {
        downloadedAt: firstDownload,
        expiresAt: cutoff < link.expiresAt ? cutoff : link.expiresAt,
      },
    });
    return { filename: `fatia-dados-${now.toISOString().slice(0, 10)}.json`, body };
  }
}
