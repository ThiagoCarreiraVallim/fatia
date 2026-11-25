import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { AiConsentKind } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

/**
 * A versão de cada texto de aceite (#384). O texto mora em `@fatia/api-client`
 * (`ai-consent.ts`), igual no PWA e no app, com a mesma versão: mudar o texto é mudar a versão
 * dos dois lados, e todo mundo aceita de novo — quem leu o texto antigo não aceitou o novo.
 */
export const AI_CONSENT_VERSIONS = { chat: '2026-11-17', webSearch: '2026-11-17' } as const;

/**
 * Os nomes que o texto do aceite mostra (#384): quem recebe as mensagens, o modelo e a busca.
 * Vêm do ambiente (`AI_CONSENT_*`, listadas no `docker-compose.prod.yml`), não do texto: trocar
 * de modelo é mudar a env **e** a lista revisada do agente (`allowed_models.py`). O aceite
 * gravado leva os nomes junto, então trocar qualquer um pede o aceite de novo.
 */
export interface AiProcessor {
  provider: string;
  model: string;
  searchEngine: string;
}

export const AI_PROCESSOR = Symbol('AI_PROCESSOR');

export function aiProcessorFromEnv(env: Record<string, string | undefined>): AiProcessor {
  const nome = (valor: string | undefined, padrao: string) => valor?.trim() || padrao;
  return {
    provider: nome(env.AI_CONSENT_PROVIDER, 'OpenRouter'),
    model: nome(env.AI_CONSENT_MODEL, 'GLM 5.3 Flash, da Z.ai'),
    searchEngine: nome(env.AI_CONSENT_SEARCH_ENGINE, 'Exa'),
  };
}

export type AiConsentTopic = 'chat' | 'web_search';

/** `off`: a IA nem oferece a busca. `ask`: oferece, e pergunta antes da primeira. `on`: busca. */
export type WebSearchMode = 'off' | 'ask' | 'on';

const KIND: Record<AiConsentTopic, AiConsentKind> = {
  chat: AiConsentKind.CHAT,
  web_search: AiConsentKind.WEB_SEARCH,
};

/** A versão do texto, a que o cliente lê e manda de volta no aceite. */
const VERSION: Record<AiConsentTopic, string> = {
  chat: AI_CONSENT_VERSIONS.chat,
  web_search: AI_CONSENT_VERSIONS.webSearch,
};

export interface AiConsentState {
  accepted: boolean;
  /** A versão do texto que vale hoje — a que o aceite precisa ter. */
  version: string;
  acceptedAt: Date | null;
}

export interface AiConsentStatus {
  chat: AiConsentState;
  webSearch: AiConsentState;
  webSearchEnabled: boolean;
  /** Os nomes que o texto do aceite mostra. */
  processor: AiProcessor;
}

/**
 * Os aceites da IA hospedada (#384): o da primeira conversa (Apple 5.1.2) e o da primeira busca
 * na web. Sem o do chat, **nada** sai para o provedor: o `ChatService` chama `assertChatConsent`
 * antes de abrir o turno. Tudo pelo `userId` do token; nenhum id vem do corpo.
 */
@Injectable()
export class AiConsentService {
  private readonly processor: AiProcessor;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(AI_PROCESSOR) processor?: AiProcessor,
  ) {
    this.processor = processor ?? aiProcessorFromEnv(process.env);
  }

  /**
   * O que fica gravado: a versão do texto e os nomes que ele mostrou. Mudar o texto (versão) ou
   * um nome (env) cai fora da linha antiga — e o aceite volta a aparecer.
   */
  private storedVersion(topic: AiConsentTopic): string {
    const { provider, model, searchEngine } = this.processor;
    const nomes = topic === 'chat' ? `${provider}|${model}` : `${provider}|${searchEngine}`;
    return `${VERSION[topic]}|${nomes}`;
  }

  private async accepted(userId: string, topic: AiConsentTopic) {
    return this.prisma.aiConsent.findUnique({
      where: {
        userId_kind_version: { userId, kind: KIND[topic], version: this.storedVersion(topic) },
      },
      select: { acceptedAt: true },
    });
  }

  async status(userId: string): Promise<AiConsentStatus> {
    const [chat, web, user] = await Promise.all([
      this.accepted(userId, 'chat'),
      this.accepted(userId, 'web_search'),
      this.prisma.user.findUnique({ where: { id: userId }, select: { webSearchEnabled: true } }),
    ]);
    return {
      chat: { accepted: !!chat, version: VERSION.chat, acceptedAt: chat?.acceptedAt ?? null },
      webSearch: {
        accepted: !!web,
        version: VERSION.web_search,
        acceptedAt: web?.acceptedAt ?? null,
      },
      webSearchEnabled: user?.webSearchEnabled ?? true,
      processor: this.processor,
    };
  }

  /** Grava o aceite do texto **atual**. Versão velha é 409: o texto mudou, leia de novo. */
  async accept(userId: string, topic: AiConsentTopic, version: string): Promise<AiConsentStatus> {
    if (version !== VERSION[topic]) {
      throw new ConflictException({
        code: 'AI_CONSENT_OUTDATED',
        message: 'O texto do aceite mudou. Leia de novo antes de aceitar.',
      });
    }
    const gravada = this.storedVersion(topic);
    await this.prisma.aiConsent.upsert({
      where: { userId_kind_version: { userId, kind: KIND[topic], version: gravada } },
      create: { userId, kind: KIND[topic], version: gravada },
      update: {},
    });
    return this.status(userId);
  }

  async setWebSearch(userId: string, enabled: boolean): Promise<AiConsentStatus> {
    await this.prisma.user.update({ where: { id: userId }, data: { webSearchEnabled: enabled } });
    return this.status(userId);
  }

  async webSearchMode(userId: string): Promise<WebSearchMode> {
    const [user, web] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { webSearchEnabled: true } }),
      this.accepted(userId, 'web_search'),
    ]);
    if (user?.webSearchEnabled === false) return 'off';
    return web ? 'on' : 'ask';
  }

  /** Sem o aceite da versão atual, o turno não abre — antes de qualquer custo. */
  async assertChatConsent(userId: string): Promise<void> {
    if (await this.accepted(userId, 'chat')) return;
    throw new ForbiddenException({
      code: 'AI_CONSENT_REQUIRED',
      // O app novo mostra o próprio aceite; o antigo, sem esse código, só mostra a mensagem.
      message:
        'Antes de usar a IA, leia e aceite para onde vão as mensagens, no chat. ' +
        'Se o aviso não aparecer, atualize o app para continuar.',
      version: VERSION.chat,
    });
  }
}
