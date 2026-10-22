import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';

/**
 * Push no navegador (Web Push com VAPID, Fase 9g): o PWA no Android e no
 * desktop, e no iPhone com o app instalado na tela de início (iOS 16.4+).
 *
 * Sem as três chaves `WEB_PUSH_*`, desligado: a tela não oferece a opção e
 * nada é enviado, como o push do celular sem `PUSH_ENABLED`.
 */

export interface WebPushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushPayload {
  title: string;
  body: string;
  /** Caminho dentro do app; o service worker confere de novo antes de abrir. */
  url: string;
}

/**
 * Os serviços de push dos navegadores. 🔴 A API faz um POST para o endpoint
 * que o navegador entrega; sem esta lista, qualquer conta logada poderia
 * apontar o servidor para um endereço interno (SSRF).
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isPushEndpoint(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.port && PUSH_HOSTS.some((h) => h.test(url.hostname));
  } catch {
    return false;
  }
}

/** Uma hora: aviso de comunidade que chega no dia seguinte já não ajuda ninguém. */
const TTL_S = 3600;

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private readonly vapid: { publicKey: string; privateKey: string; subject: string } | null;

  constructor(config: ConfigService) {
    const publicKey = config.get<string>('WEB_PUSH_VAPID_PUBLIC_KEY')?.trim();
    const privateKey = config.get<string>('WEB_PUSH_VAPID_PRIVATE_KEY')?.trim();
    const subject = config.get<string>('WEB_PUSH_SUBJECT')?.trim();
    this.vapid = publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
  }

  /** A chave pública que o navegador usa ao se inscrever; `null` é "desligado". */
  publicKey(): string | null {
    return this.vapid?.publicKey ?? null;
  }

  /** Envia a cada inscrição. Devolve os endpoints que o serviço disse que acabaram (404/410). */
  async send(targets: WebPushTarget[], payload: WebPushPayload): Promise<{ gone: string[] }> {
    const gone: string[] = [];
    if (!this.vapid || targets.length === 0) return { gone };
    const corpo = JSON.stringify(payload);
    await Promise.all(
      targets.map(async (t) => {
        try {
          await webpush.sendNotification(
            { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
            corpo,
            { TTL: TTL_S, vapidDetails: this.vapid!, timeout: 10_000 },
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(t.endpoint);
          // Sem o endpoint no log: ele identifica o navegador de alguém.
          else this.logger.warn(`Web push recusado: ${status ?? (err as Error).name}`);
        }
      }),
    );
    return { gone };
  }
}
