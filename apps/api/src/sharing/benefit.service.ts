import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { GroupPartnerBenefit, MediaFile, PartnerBenefitKind } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { addDaysIso, todayInTz } from '../progress/helpers/date-tz';
import { MediaService } from '../storage/media.service';
import { requireContentRole } from './content-roles';

export interface BenefitInput {
  partnerName: string;
  discountText: string;
  kind: PartnerBenefitKind;
  couponCode?: string | null;
  url?: string | null;
  /** Último dia em que vale (`YYYY-MM-DD`), no fuso da comunidade. */
  validUntil: string;
  /** Logo enviado por `/media/uploads` com `purpose: benefit_logo`; `null` tira. */
  logoFileId?: string | null;
}

/** O que o membro vê (Cm-22). Nada de quem cadastrou: o benefício é da comunidade. */
export interface MemberBenefitView {
  id: string;
  partnerName: string;
  logoUrl: string | null;
  discountText: string;
  kind: PartnerBenefitKind;
  /** Só enquanto vale. Vencido mostra só o aviso "Venceu…". */
  couponCode: string | null;
  url: string | null;
  validUntil: string;
  /** Venceu ontem: aparece apagado e sai da lista amanhã. */
  expired: boolean;
}

/** O que o painel vê (Pn-28): tudo, com o estado. */
export interface TeamBenefitView extends Omit<MemberBenefitView, 'expired'> {
  logoFileId: string | null;
  status: 'active' | 'expired';
  createdAt: Date;
  updatedAt: Date;
}

type Row = GroupPartnerBenefit & { logo: MediaFile | null };

const NOT_FOUND = 'Benefício não encontrado';
const CUPOM = /^[A-Za-z0-9_-]{2,40}$/;

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

/**
 * Benefícios de parceiros da comunidade (#393).
 *
 * O dono cadastra (`benefit.manage`); o membro ativo lê (`benefit.read`). O
 * Fatia só guarda o texto, o cupom e o link: não rastreia compra e não manda
 * dado de membro a ninguém — a pessoa copia o cupom ou abre o link fora do app.
 *
 * Todo id vem amarrado ao `groupId` da URL: benefício de outra comunidade é 404.
 */
@Injectable()
export class BenefitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  /**
   * Os que valem hoje, e os que venceram ontem (apagados, sem cupom nem link),
   * no fuso da comunidade. O filtro é do servidor: o cupom vencido não sai.
   */
  async listForMember(userId: string, groupId: string): Promise<MemberBenefitView[]> {
    await requireContentRole(this.prisma, userId, groupId, 'benefit.read');
    const hoje = await this.today(groupId);
    const rows = await this.prisma.groupPartnerBenefit.findMany({
      where: { groupId, validUntil: { gte: asDate(addDaysIso(hoje, -1)) } },
      include: { logo: true },
      orderBy: [{ validUntil: 'asc' }, { createdAt: 'asc' }],
    });
    const views = await Promise.all(rows.map((r) => this.memberView(r, hoje)));
    // Os que valem antes dos vencidos.
    return [...views.filter((v) => !v.expired), ...views.filter((v) => v.expired)];
  }

  async listForTeam(userId: string, groupId: string): Promise<TeamBenefitView[]> {
    await this.assertManager(userId, groupId);
    const hoje = await this.today(groupId);
    const rows = await this.prisma.groupPartnerBenefit.findMany({
      where: { groupId },
      include: { logo: true },
      orderBy: [{ validUntil: 'desc' }, { createdAt: 'desc' }],
    });
    return Promise.all(rows.map((r) => this.teamView(r, hoje)));
  }

  async create(userId: string, groupId: string, input: BenefitInput): Promise<TeamBenefitView> {
    await this.assertManager(userId, groupId);
    const hoje = await this.today(groupId);
    const dados = this.validate(input, hoje, true);
    const logoFileId = input.logoFileId ? await this.resolveLogo(groupId, input.logoFileId) : null;
    const row = await this.prisma.groupPartnerBenefit.create({
      data: { ...dados, groupId, logoFileId, createdById: userId },
      include: { logo: true },
    });
    return this.teamView(row, hoje);
  }

  async update(
    userId: string,
    groupId: string,
    id: string,
    input: Partial<BenefitInput>,
  ): Promise<TeamBenefitView> {
    await this.assertManager(userId, groupId);
    const atual = await this.find(groupId, id);
    const hoje = await this.today(groupId);
    const junto: BenefitInput = {
      partnerName: input.partnerName ?? atual.partnerName,
      discountText: input.discountText ?? atual.discountText,
      kind: input.kind ?? atual.kind,
      couponCode: input.couponCode !== undefined ? input.couponCode : atual.couponCode,
      url: input.url !== undefined ? input.url : atual.url,
      validUntil: input.validUntil ?? ymd(atual.validUntil),
    };
    // A validade só é cobrada quando muda: editar o texto de um vencido pode.
    const dados = this.validate(junto, hoje, input.validUntil !== undefined);
    let logoFileId = atual.logoFileId;
    if (input.logoFileId !== undefined && input.logoFileId !== atual.logoFileId) {
      logoFileId = input.logoFileId ? await this.resolveLogo(groupId, input.logoFileId) : null;
    }
    const row = await this.prisma.groupPartnerBenefit.update({
      where: { id: atual.id },
      data: { ...dados, logoFileId },
      include: { logo: true },
    });
    if (logoFileId !== atual.logoFileId) await this.media.discardById(atual.logoFileId);
    return this.teamView(row, hoje);
  }

  async remove(userId: string, groupId: string, id: string): Promise<{ id: string }> {
    await this.assertManager(userId, groupId);
    const atual = await this.find(groupId, id);
    await this.prisma.groupPartnerBenefit.delete({ where: { id: atual.id } });
    await this.media.discardById(atual.logoFileId);
    return { id: atual.id };
  }

  // ---------------------------------------------------------------- internos

  private assertManager(userId: string, groupId: string) {
    return requireContentRole(
      this.prisma,
      userId,
      groupId,
      'benefit.manage',
      'Só o dono cuida dos benefícios da comunidade',
    );
  }

  private async today(groupId: string): Promise<string> {
    const { timezone } = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { timezone: true },
    });
    return todayInTz(timezone);
  }

  private async find(groupId: string, id: string): Promise<GroupPartnerBenefit> {
    const row = await this.prisma.groupPartnerBenefit.findFirst({ where: { id, groupId } });
    if (!row) throw new NotFoundException(NOT_FOUND);
    return row;
  }

  private async resolveLogo(groupId: string, fileId: string): Promise<string> {
    return (await this.media.resolveForGroup(groupId, fileId, 'benefit_logo')).id;
  }

  /** Cupom tem código e não tem link; link é https e não tem cupom. */
  private validate(input: BenefitInput, hoje: string, checkDate: boolean) {
    const partnerName = input.partnerName.trim();
    const discountText = input.discountText.trim();
    if (!partnerName || !discountText) {
      throw new BadRequestException('Diga o parceiro e o desconto');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validUntil)) {
      throw new BadRequestException('Validade inválida');
    }
    if (checkDate && input.validUntil < hoje) {
      throw new BadRequestException('A validade não pode estar no passado');
    }
    let couponCode: string | null = null;
    let url: string | null = null;
    if (input.kind === 'COUPON') {
      couponCode = input.couponCode?.trim() ?? '';
      if (!CUPOM.test(couponCode)) {
        throw new BadRequestException('O cupom precisa de um código (letras, números, - e _)');
      }
    } else {
      url = input.url?.trim() ?? '';
      if (!isHttps(url)) throw new BadRequestException('O link precisa começar com https://');
    }
    return {
      partnerName,
      discountText,
      kind: input.kind,
      couponCode,
      url,
      validUntil: asDate(input.validUntil),
    };
  }

  private async memberView(r: Row, hoje: string): Promise<MemberBenefitView> {
    const validUntil = ymd(r.validUntil);
    const expired = validUntil < hoje;
    return {
      id: r.id,
      partnerName: r.partnerName,
      logoUrl: (await this.media.viewOrNull(r.logo))?.url ?? null,
      discountText: r.discountText,
      kind: r.kind,
      couponCode: expired ? null : r.couponCode,
      url: expired ? null : r.url,
      validUntil,
      expired,
    };
  }

  private async teamView(r: Row, hoje: string): Promise<TeamBenefitView> {
    const validUntil = ymd(r.validUntil);
    return {
      id: r.id,
      partnerName: r.partnerName,
      logoUrl: (await this.media.viewOrNull(r.logo))?.url ?? null,
      logoFileId: r.logoFileId,
      discountText: r.discountText,
      kind: r.kind,
      couponCode: r.couponCode,
      url: r.url,
      validUntil,
      status: validUntil < hoje ? 'expired' : 'active',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
