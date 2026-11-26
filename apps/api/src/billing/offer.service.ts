import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type OfferStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../notifications/email.service';
import { assertGroupAction } from '../sharing/permissions';
import { escapeHtml } from './seat-invoice-email';

export interface OfferInput {
  title?: string;
  description?: string | null;
  priceCents?: number;
  spots?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  grantsEntry?: boolean;
  programId?: string | null;
  planTemplateId?: string | null;
  extras?: string | null;
}

export interface OfferView {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  priceCents: number;
  spots: number | null;
  startDate: string | null;
  endDate: string | null;
  grantsEntry: boolean;
  program: { id: string; name: string } | null;
  planTemplate: { id: string; title: string } | null;
  extras: string | null;
  status: OfferStatus;
  publishedAt: string | null;
  closedAt: string | null;
  /** Página de venda: `<web>/<código da comunidade>/<slug>`. */
  saleUrl: string;
  stats: {
    /** Compras pagas. */
    sales: number;
    /** Vagas que sobram; nulo sem limite. */
    spotsLeft: number | null;
    /** Pago, bruto. */
    revenueCents: number;
    /** O que fica com a comunidade, depois da taxa da plataforma. */
    netCents: number;
    // Sem "ativaram em 48 h": ler refeições e treinos de quem comprou pede o
    // consentimento dele, que só a conta da compra (#421) vai trazer.
  };
  /** Pagamentos que falharam (Pn-37b): não recebem o conteúdo novo até pagar. */
  failed: { purchaseId: string; name: string; since: string | null; canResend: boolean }[];
}

export interface OffersList {
  /** A venda pelo Asaas está ligada nesta instância (`OFFERS_SALES_ENABLED`). */
  salesEnabled: boolean;
  platformFeePercent: number;
  offers: OfferView[];
}

const OFFER_INCLUDE = {
  group: { select: { slug: true } },
  program: { select: { id: true, name: true } },
  planTemplate: { select: { id: true, title: true } },
} satisfies Prisma.GroupOfferInclude;

type OfferRow = Prisma.GroupOfferGetPayload<{ include: typeof OFFER_INCLUDE }>;

/** Um reenvio do link por compra a cada hora. */
const REENVIO_MS = 60 * 60_000;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ofertas (#403, Pn-37 e Pn-37b): programas vendidos pela comunidade, pagos
 * pelo Asaas. Aqui o dono cria, edita, publica, encerra e duplica, e vê
 * vendas, receita e quem não pagou. A venda em si (checkout público, conta
 * depois do pagamento, repasse) é da #421 e só liga com `OFFERS_SALES_ENABLED`:
 * nenhum dado de cartão passa pelo Fatia, só o link de pagamento do Asaas.
 *
 * Só o dono (`billing.manage`), e todo id do corpo (programa, modelo de plano)
 * é amarrado à comunidade da URL (ADR 010).
 */
@Injectable()
export class OfferService {
  private readonly logger = new Logger(OfferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  private salesEnabled(): boolean {
    return this.config.get<boolean>('OFFERS_SALES_ENABLED', false) === true;
  }

  private feePercent(): number {
    return this.config.get<number>('OFFERS_PLATFORM_FEE_PERCENT', 0);
  }

  private web(): string {
    return (this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3030').replace(/\/+$/, '');
  }

  async list(groupId: string, now: Date = new Date()): Promise<OffersList> {
    const rows = await this.prisma.groupOffer.findMany({
      where: { groupId },
      include: OFFER_INCLUDE,
      orderBy: [{ createdAt: 'desc' }],
    });
    return {
      salesEnabled: this.salesEnabled(),
      platformFeePercent: this.feePercent(),
      offers: await Promise.all(rows.map((r) => this.view(r, now))),
    };
  }

  async create(
    actorId: string,
    groupId: string,
    input: OfferInput & { title: string; priceCents: number },
  ): Promise<OfferView> {
    await this.assertOwner(actorId, groupId);
    const dados = await this.validate(groupId, input);
    const title = dados.title as string;
    const row = await this.withSlug(groupId, title, (slug) =>
      this.prisma.groupOffer.create({
        data: {
          groupId,
          slug,
          title,
          description: dados.description ?? null,
          priceCents: dados.priceCents as number,
          spots: dados.spots ?? null,
          startDate: dados.startDate ?? null,
          endDate: dados.endDate ?? null,
          grantsEntry: dados.grantsEntry ?? true,
          programId: dados.programId ?? null,
          planTemplateId: dados.planTemplateId ?? null,
          extras: dados.extras ?? null,
          createdById: actorId,
        },
        include: OFFER_INCLUDE,
      }),
    );
    return this.view(row);
  }

  async update(
    actorId: string,
    groupId: string,
    offerId: string,
    input: OfferInput,
  ): Promise<OfferView> {
    await this.assertOwner(actorId, groupId);
    const atual = await this.find(groupId, offerId);
    if (atual.status === 'CLOSED') {
      throw new ConflictException('Oferta encerrada não muda. Duplique para vender de novo.');
    }
    const dados = await this.validate(groupId, { ...atual, ...input });
    const row = await this.prisma.groupOffer.update({
      where: { id: atual.id },
      data: {
        title: dados.title,
        description: dados.description ?? null,
        priceCents: dados.priceCents,
        spots: dados.spots ?? null,
        startDate: dados.startDate ?? null,
        endDate: dados.endDate ?? null,
        grantsEntry: dados.grantsEntry ?? true,
        programId: dados.programId ?? null,
        planTemplateId: dados.planTemplateId ?? null,
        extras: dados.extras ?? null,
      },
      include: OFFER_INCLUDE,
    });
    return this.view(row);
  }

  async publish(actorId: string, groupId: string, offerId: string): Promise<OfferView> {
    await this.assertOwner(actorId, groupId);
    const atual = await this.find(groupId, offerId);
    if (atual.status === 'CLOSED') throw new ConflictException('Esta oferta já foi encerrada.');
    if (atual.status === 'ACTIVE') return this.view(atual);
    const row = await this.prisma.groupOffer.update({
      where: { id: atual.id },
      data: { status: 'ACTIVE', publishedAt: new Date() },
      include: OFFER_INCLUDE,
    });
    return this.view(row);
  }

  /** Encerra: não vende mais. Quem comprou continua com o que recebeu. */
  async close(actorId: string, groupId: string, offerId: string): Promise<OfferView> {
    await this.assertOwner(actorId, groupId);
    const atual = await this.find(groupId, offerId);
    if (atual.status === 'CLOSED') return this.view(atual);
    const row = await this.prisma.groupOffer.update({
      where: { id: atual.id },
      data: { status: 'CLOSED', closedAt: new Date() },
      include: OFFER_INCLUDE,
    });
    return this.view(row);
  }

  /** "Duplicar para janeiro": um rascunho igual, com as datas um mês depois. */
  async duplicate(actorId: string, groupId: string, offerId: string): Promise<OfferView> {
    await this.assertOwner(actorId, groupId);
    const o = await this.find(groupId, offerId);
    const row = await this.withSlug(groupId, o.title, (slug) =>
      this.prisma.groupOffer.create({
        data: {
          groupId,
          slug,
          title: o.title,
          description: o.description,
          priceCents: o.priceCents,
          spots: o.spots,
          startDate: o.startDate ? nextMonth(o.startDate) : null,
          endDate: o.endDate ? nextMonth(o.endDate) : null,
          grantsEntry: o.grantsEntry,
          // O programa é de um período; o novo período pede outro programa.
          programId: null,
          planTemplateId: o.planTemplateId,
          extras: o.extras,
          createdById: actorId,
        },
        include: OFFER_INCLUDE,
      }),
    );
    return this.view(row);
  }

  /**
   * "Reenviar link de pagamento" (Pn-37b): o link do Asaas da compra que
   * falhou vai de novo ao e-mail de quem comprou. Uma vez por hora por compra.
   */
  async resendLink(
    actorId: string,
    groupId: string,
    offerId: string,
    purchaseId: string,
    now: Date = new Date(),
  ): Promise<{ sent: boolean }> {
    await this.assertOwner(actorId, groupId);
    const offer = await this.find(groupId, offerId);
    const compra = await this.prisma.groupOfferPurchase.findFirst({
      where: { id: purchaseId, offerId: offer.id, status: 'FAILED' },
    });
    if (!compra || !compra.paymentUrl) throw new NotFoundException('Pagamento não encontrado.');
    // Marca antes de mandar: dois cliques não mandam dois e-mails.
    const { count } = await this.prisma.groupOfferPurchase.updateMany({
      where: {
        id: compra.id,
        OR: [
          { linkResentAt: null },
          { linkResentAt: { lt: new Date(now.getTime() - REENVIO_MS) } },
        ],
      },
      data: { linkResentAt: now },
    });
    if (count === 0) {
      throw new ConflictException(
        'O link já foi reenviado há pouco. Tente de novo daqui a uma hora.',
      );
    }
    const grupo = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { name: true },
    });
    const linhas = [
      `Oi, ${compra.buyerName.split(' ')[0]}.`,
      `O pagamento de ${offer.title} (${grupo.name}) não foi concluído. Para receber o conteúdo, pague pelo link:`,
      compra.paymentUrl,
      'O que você já registrou no Fatia continua com você.',
    ];
    const url = escapeHtml(compra.paymentUrl);
    const sent = await this.email.send({
      to: compra.buyerEmail,
      subject: `Pagamento pendente: ${offer.title}`,
      text: linhas.join('\n\n'),
      html: `<!doctype html><html lang="pt-BR"><body style="font-family:Manrope,Arial,sans-serif;color:#1b1b1b">${linhas
        .map((l) =>
          l === compra.paymentUrl
            ? `<p><a href="${url}" style="display:inline-block;padding:12px 22px;border-radius:12px;font-weight:800;text-decoration:none;background:#1b1b1b;color:#ffffff">Pagar agora</a></p>`
            : `<p>${escapeHtml(l)}</p>`,
        )
        .join('')}</body></html>`,
    });
    this.logger.log({ event: 'link_de_oferta_reenviado', offerId: offer.id });
    return { sent };
  }

  // ---------------------------------------------------------------- internos

  private async view(o: OfferRow, now: Date = new Date()): Promise<OfferView> {
    const [pagas, falhas] = await Promise.all([
      this.prisma.groupOfferPurchase.findMany({
        where: { offerId: o.id, status: 'PAID' },
        select: { amountCents: true },
      }),
      this.prisma.groupOfferPurchase.findMany({
        where: { offerId: o.id, status: 'FAILED' },
        orderBy: { failedAt: 'asc' },
        select: { id: true, buyerName: true, failedAt: true, paymentUrl: true, linkResentAt: true },
      }),
    ]);
    const revenueCents = pagas.reduce((s, p) => s + p.amountCents, 0);
    const fee = Math.round((revenueCents * this.feePercent()) / 100);
    return {
      id: o.id,
      slug: o.slug,
      title: o.title,
      description: o.description,
      priceCents: o.priceCents,
      spots: o.spots,
      startDate: o.startDate,
      endDate: o.endDate,
      grantsEntry: o.grantsEntry,
      program: o.program,
      planTemplate: o.planTemplate,
      extras: o.extras,
      status: o.status,
      publishedAt: o.publishedAt?.toISOString() ?? null,
      closedAt: o.closedAt?.toISOString() ?? null,
      saleUrl: `${this.web()}/${o.group.slug}/${o.slug}`,
      stats: {
        sales: pagas.length,
        spotsLeft: o.spots === null ? null : Math.max(0, o.spots - pagas.length),
        revenueCents,
        netCents: revenueCents - fee,
      },
      failed: falhas.map((f) => ({
        purchaseId: f.id,
        name: f.buyerName,
        since: f.failedAt?.toISOString() ?? null,
        canResend:
          f.paymentUrl !== null &&
          (!f.linkResentAt || now.getTime() - f.linkResentAt.getTime() >= REENVIO_MS),
      })),
    };
  }

  private async validate(groupId: string, i: OfferInput): Promise<OfferInput> {
    const title = i.title?.trim();
    if (!title) throw new BadRequestException('Dê um nome à oferta.');
    if (!Number.isInteger(i.priceCents) || (i.priceCents as number) < 100) {
      throw new BadRequestException('O preço mínimo é R$ 1,00.');
    }
    if (i.spots !== undefined && i.spots !== null && (!Number.isInteger(i.spots) || i.spots < 1)) {
      throw new BadRequestException('As vagas são um número a partir de 1.');
    }
    for (const d of [i.startDate, i.endDate]) {
      if (d && !DIA.test(d)) throw new BadRequestException('Datas no formato AAAA-MM-DD.');
    }
    if (i.startDate && i.endDate && i.endDate < i.startDate) {
      throw new BadRequestException('O fim vem depois do começo.');
    }
    if (i.programId) {
      const p = await this.prisma.groupProgram.findFirst({
        where: { id: i.programId, groupId },
        select: { id: true },
      });
      if (!p) throw new NotFoundException('Programa não encontrado.');
    }
    if (i.planTemplateId) {
      const t = await this.prisma.groupPlanTemplate.findFirst({
        where: { id: i.planTemplateId, groupId },
        select: { id: true },
      });
      if (!t) throw new NotFoundException('Plano não encontrado.');
    }
    return {
      ...i,
      title,
      description: i.description?.trim() || null,
      extras: i.extras?.trim() || null,
    };
  }

  private async find(groupId: string, offerId: string): Promise<OfferRow> {
    const o = await this.prisma.groupOffer.findFirst({
      where: { id: offerId, groupId },
      include: OFFER_INCLUDE,
    });
    if (!o) throw new NotFoundException('Oferta não encontrada.');
    return o;
  }

  /** Cria com o slug do título; se já existe na comunidade, tenta "-2", "-3"... */
  private async withSlug<T>(groupId: string, title: string, criar: (slug: string) => Promise<T>) {
    const base = slugify(title) || 'oferta';
    const usados = new Set(
      (
        await this.prisma.groupOffer.findMany({
          where: { groupId, slug: { startsWith: base } },
          select: { slug: true },
        })
      ).map((o) => o.slug),
    );
    for (let n = 1; n < 1000; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      if (usados.has(slug)) continue;
      try {
        return await criar(slug);
      } catch (err) {
        // Corrida com outra criação do mesmo nome: tenta o próximo.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
        throw err;
      }
    }
    throw new ConflictException('Não deu para criar o link da oferta. Mude o nome.');
  }

  private async assertOwner(actorId: string, groupId: string): Promise<void> {
    const m = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId: actorId } },
      select: { role: true, status: true, group: { select: { isDemo: true } } },
    });
    if (!m || m.status !== 'ACTIVE') throw new NotFoundException('Comunidade não encontrada.');
    assertGroupAction(m, 'billing.manage', 'Só o dono da comunidade cuida das ofertas.');
  }
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** O mesmo dia no mês seguinte, preso ao último dia (31/01 → 28 ou 29/02). */
function nextMonth(ymd: string): string {
  const [a, m, d] = ymd.split('-').map(Number);
  const ano = m === 12 ? a + 1 : a;
  const mes = m === 12 ? 1 : m + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}
