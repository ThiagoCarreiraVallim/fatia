import { Injectable } from '@nestjs/common';
import type { ApiKeyScope, GroupType } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import type { QuotaState } from './api-key';

export interface ApiKeyView {
  id: string;
  name: string;
  /** Os 4 últimos caracteres ("fatia_live_…8f2a"). */
  lastFour: string;
  scopes: ApiKeyScope[];
  createdAt: Date;
  createdBy: string | null;
  lastUsedAt: Date | null;
  /** Chamadas desta chave no mês da cota. */
  callsThisMonth: number;
  revokedAt: Date | null;
}

export interface ApiQuotaView {
  /** AAAA-MM, no fuso da comunidade. */
  month: string;
  used: number;
  limit: number;
  /** AAAA-MM-DD: o dia em que a cota volta a zero. */
  renewsOn: string;
  state: QuotaState;
}

export interface ApiKeysView {
  keys: ApiKeyView[];
  quota: ApiQuotaView;
}

export interface CreatedApiKey {
  key: ApiKeyView;
  /** O segredo inteiro, só nesta resposta: o banco guarda o hash. */
  secret: string;
}

/** Quem chama com uma chave válida: a comunidade dela, nada de pessoa. */
export interface ApiKeyContext {
  keyId: string;
  groupId: string;
  groupType: GroupType;
  timezone: string;
  scopes: ApiKeyScope[];
}

export interface CreateApiKeyInput {
  name: string;
  scopes?: ApiKeyScope[];
}

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actorId: string, groupId: string): Promise<ApiKeysView> {
    void actorId;
    void groupId;
    void this.prisma;
    throw new Error('a fazer');
  }

  async create(actorId: string, groupId: string, input: CreateApiKeyInput): Promise<CreatedApiKey> {
    void actorId;
    void groupId;
    void input;
    throw new Error('a fazer');
  }

  async revoke(actorId: string, groupId: string, keyId: string): Promise<ApiKeyView> {
    void actorId;
    void groupId;
    void keyId;
    throw new Error('a fazer');
  }

  async authenticate(raw: string | null | undefined): Promise<ApiKeyContext> {
    void raw;
    throw new Error('a fazer');
  }

  async consume(ctx: ApiKeyContext, scope: ApiKeyScope, endpoint: string): Promise<void> {
    void ctx;
    void scope;
    void endpoint;
    throw new Error('a fazer');
  }

  async quota(groupId: string, now?: Date): Promise<ApiQuotaView> {
    void groupId;
    void now;
    throw new Error('a fazer');
  }
}
