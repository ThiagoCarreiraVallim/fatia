import { createHash, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { assinaturaDoAssinante, type RcSubscriber, type RcWebhook } from './revenuecat';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 10_000;

/**
 * Compra dentro do app (Apple e Google) pela RevenueCat (ADR 024).
 *
 * O app faz login na RevenueCat com o id do usuário do Fatia, então
 * `app_user_id` é o nosso `User.id`. Comprar "para outra pessoa" trocando o
 * id no app só daria PRO a ela — presente, não fraude —, e o `sync` pelo app
 * só atua na pessoa autenticada.
 */
@Injectable()
export class RevenueCatService {
  private readonly logger = new Logger(RevenueCatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  configurado(): boolean {
    return Boolean(this.segredoDaRest() && this.config.get<string>('REVENUECAT_WEBHOOK_AUTH'));
  }

  /** Webhook: autentica, registra uma vez e sincroniza o assinante. */
  async processarWebhook(
    authorization: string | undefined,
    corpo: string,
  ): Promise<{ received: true; duplicate?: true; ignored?: string }> {
    const esperado = this.config.get<string>('REVENUECAT_WEBHOOK_AUTH') ?? '';
    if (!esperado || !this.segredoDaRest()) {
      throw new ServiceUnavailableException('RevenueCat não configurada.');
    }
    if (!segredoConfere(authorization, esperado))
      throw new UnauthorizedException('Token inválido.');

    let webhook: RcWebhook;
    try {
      webhook = JSON.parse(corpo) as RcWebhook;
    } catch {
      throw new BadRequestException('Evento inválido.');
    }
    const ev = webhook.event;
    if (!ev?.id || !ev.type) throw new BadRequestException('Evento inválido.');

    try {
      await this.prisma.billingWebhookEvent.create({
        data: {
          provider: 'revenuecat',
          eventId: ev.id,
          type: ev.type,
          payload: { type: ev.type, appUserId: ev.app_user_id ?? null },
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { received: true, duplicate: true };
      }
      throw err;
    }

    const marcar = (error: string | null) =>
      this.prisma.billingWebhookEvent.update({
        where: { provider_eventId: { provider: 'revenuecat', eventId: ev.id as string } },
        data: { processedAt: new Date(), error },
      });

    if (ev.type === 'TEST') {
      await marcar(null);
      return { received: true };
    }

    const candidatos = [ev.app_user_id, ev.original_app_user_id, ...(ev.aliases ?? [])].filter(
      (id): id is string => typeof id === 'string' && UUID.test(id),
    );
    const user = candidatos.length
      ? await this.prisma.user.findFirst({
          where: { id: { in: candidatos } },
          select: { id: true },
        })
      : null;
    if (!user) {
      await marcar('usuario_desconhecido');
      return { received: true, ignored: 'usuario_desconhecido' };
    }

    // Falha ao ler a REST sobe como 503: a RevenueCat reentrega o webhook, e
    // o evento já gravado não impede o `sync` da próxima tentativa — por isso
    // ele é apagado aqui, para a reentrega não virar "duplicado".
    try {
      await this.sincronizar(user.id);
    } catch (err) {
      await this.prisma.billingWebhookEvent.delete({
        where: { provider_eventId: { provider: 'revenuecat', eventId: ev.id } },
      });
      throw err;
    }
    await marcar(null);
    return { received: true };
  }

  /**
   * Lê o assinante na RevenueCat e deixa `UserSubscription` igual a ele. Só
   * mexe nas linhas de loja (APPLE/GOOGLE) desta pessoa.
   */
  async sincronizar(userId: string, agora: Date = new Date()): Promise<void> {
    const chave = this.segredoDaRest();
    if (!chave)
      throw new ServiceUnavailableException('Compra no app indisponível nesta instância.');

    const base = this.config.get<string>('REVENUECAT_BASE_URL', 'https://api.revenuecat.com');
    let resposta: Response;
    try {
      resposta = await fetch(
        `${base.replace(/\/+$/, '')}/v1/subscribers/${encodeURIComponent(userId)}`,
        {
          headers: { Authorization: `Bearer ${chave}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
    } catch (err) {
      this.logger.warn({ event: 'revenuecat_inacessivel', err: (err as Error).name });
      throw new ServiceUnavailableException('Não foi possível confirmar a compra agora.');
    }
    if (!resposta.ok) {
      this.logger.warn({ event: 'revenuecat_erro', status: resposta.status });
      throw new ServiceUnavailableException('Não foi possível confirmar a compra agora.');
    }
    const corpo = (await resposta.json().catch(() => null)) as { subscriber?: RcSubscriber } | null;
    const entitlement = this.config.get<string>('REVENUECAT_ENTITLEMENT_ID', 'pro');
    const desejada = assinaturaDoAssinante(corpo?.subscriber ?? {}, userId, entitlement, agora);

    await this.prisma.$transaction(async (tx) => {
      // Troca de produto (mensal → anual) ou fim do entitlement: as outras
      // linhas de loja vivas desta pessoa expiram.
      await tx.userSubscription.updateMany({
        where: {
          userId,
          source: { in: ['APPLE', 'GOOGLE'] },
          status: { in: ['ACTIVE', 'PAST_DUE', 'PENDING'] },
          ...(desejada ? { NOT: { providerRef: desejada.providerRef } } : {}),
        },
        data: { status: 'EXPIRED', canceledAt: agora },
      });
      if (!desejada) return;
      const { source, providerRef, ...campos } = desejada;
      await tx.userSubscription.upsert({
        where: { source_providerRef: { source, providerRef } },
        create: { userId, source, providerRef, ...campos },
        update: { ...campos, canceledAt: campos.status === 'EXPIRED' ? agora : null },
      });
    });
  }

  private segredoDaRest(): string {
    return this.config.get<string>('REVENUECAT_SECRET_KEY') ?? '';
  }
}

function segredoConfere(recebido: string | undefined, esperado: string): boolean {
  if (!recebido) return false;
  // Aceita o valor puro ou com "Bearer ", que é como o painel costuma ser preenchido.
  const valor = recebido.replace(/^Bearer\s+/i, '');
  const alvo = esperado.replace(/^Bearer\s+/i, '');
  const a = createHash('sha256').update(valor).digest();
  const b = createHash('sha256').update(alvo).digest();
  return timingSafeEqual(a, b);
}
