import { Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OfferStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../notifications/email.service';

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
  saleUrl: string;
  stats: {
    sales: number;
    spotsLeft: number | null;
    revenueCents: number;
    netCents: number;
    activated48h: number;
  };
  failed: { purchaseId: string; name: string; since: string | null; canResend: boolean }[];
}

export interface OffersList {
  salesEnabled: boolean;
  platformFeePercent: number;
  offers: OfferView[];
}

@Injectable()
export class OfferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  list(_groupId: string): Promise<OffersList> {
    throw new NotImplementedException();
  }
  create(
    _a: string,
    _g: string,
    _i: OfferInput & { title: string; priceCents: number },
  ): Promise<OfferView> {
    throw new NotImplementedException();
  }
  update(_a: string, _g: string, _o: string, _i: OfferInput): Promise<OfferView> {
    throw new NotImplementedException();
  }
  publish(_a: string, _g: string, _o: string): Promise<OfferView> {
    throw new NotImplementedException();
  }
  close(_a: string, _g: string, _o: string): Promise<OfferView> {
    throw new NotImplementedException();
  }
  duplicate(_a: string, _g: string, _o: string): Promise<OfferView> {
    throw new NotImplementedException();
  }
  resendLink(_a: string, _g: string, _o: string, _p: string): Promise<{ sent: boolean }> {
    throw new NotImplementedException();
  }
}
