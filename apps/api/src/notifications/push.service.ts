import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** A Expo devolve até 1000 recibos por requisição. */
export const EXPO_RECEIPTS_BATCH = 1000;
/** A Expo aceita até 100 mensagens por requisição. */
export const EXPO_BATCH_SIZE = 100;
const TIMEOUT_MS = 10_000;

/** Canal do Android criado pelo app para os avisos da comunidade. */
export const PUSH_CHANNEL_ID = 'avisos';

/** Formato do token que o `expo-notifications` devolve. */
export const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,128}\]$/;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** Caminho dentro do app que o toque abre (`notificationTarget` confere de novo lá). */
  url: string;
}

export interface PushOutcome {
  sent: number;
  /** Tokens que a Expo disse que não existem mais: o aparelho desinstalou ou trocou. */
  unregistered: string[];
  /** Ticket de cada envio aceito, para ler o recibo depois (Fase 9g). */
  tickets: { to: string; id: string }[];
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** O recibo de um ticket: se a Apple ou o Google aceitaram a entrega. */
export interface ExpoReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Envio pela API HTTP da Expo (ADR 033), sem SDK: é um POST com JSON, e o SDK
 * traria dependência para fazer isso e o mesmo lote de 100.
 *
 * Sem `PUSH_ENABLED=true` não envia e não falha, como o e-mail: o dev e os
 * testes não mandam aviso para celular de ninguém. Falha de rede também não
 * derruba quem chamou — o aviso é complemento, a ação já aconteceu.
 *
 * Duas etapas da Expo: o envio devolve um ticket por mensagem, e o recibo de
 * cada ticket (lido uns 15 minutos depois, `receipts`) diz se a Apple ou o
 * Google entregaram. `DeviceNotRegistered` pode chegar em qualquer das duas
 * (Fase 9g; antes só a primeira era lida).
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly enabled: boolean;
  private readonly accessToken: string | null;

  constructor(config: ConfigService) {
    this.enabled = config.get<string>('PUSH_ENABLED') === 'true';
    this.accessToken = config.get<string>('EXPO_ACCESS_TOKEN') || null;
  }

  async send(messages: PushMessage[]): Promise<PushOutcome> {
    const outcome: PushOutcome = { sent: 0, unregistered: [], tickets: [] };
    if (messages.length === 0) return outcome;
    if (!this.enabled) {
      this.logger.log(`Push não enviado (PUSH_ENABLED desligado): ${messages.length} aviso(s)`);
      return outcome;
    }
    for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
      const lote = messages.slice(i, i + EXPO_BATCH_SIZE);
      try {
        const tickets = await this.post(lote);
        tickets.forEach((t, j) => {
          if (t.status === 'ok') {
            outcome.sent += 1;
            if (t.id) outcome.tickets.push({ to: lote[j]!.to, id: t.id });
          } else if (t.details?.error === 'DeviceNotRegistered') {
            outcome.unregistered.push(lote[j]!.to);
          } else {
            // Sem o token no log: ele é o endereço do celular de alguém.
            this.logger.warn(`Push recusado: ${t.details?.error ?? t.message ?? 'sem motivo'}`);
          }
        });
      } catch (err) {
        this.logger.warn(
          `Falha ao enviar ${lote.length} push: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return outcome;
  }

  /** Os recibos de tickets já enviados. Sem `PUSH_ENABLED`, nenhum. Não lança. */
  async receipts(ids: string[]): Promise<Record<string, ExpoReceipt>> {
    const todos: Record<string, ExpoReceipt> = {};
    if (!this.enabled || ids.length === 0) return todos;
    for (let i = 0; i < ids.length; i += EXPO_RECEIPTS_BATCH) {
      const lote = ids.slice(i, i + EXPO_RECEIPTS_BATCH);
      try {
        const res = await fetch(EXPO_RECEIPTS_URL, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
          },
          body: JSON.stringify({ ids: lote }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`Expo respondeu ${res.status}`);
        const json = (await res.json()) as { data?: Record<string, ExpoReceipt> };
        Object.assign(todos, json.data ?? {});
      } catch (err) {
        this.logger.warn(
          `Falha ao ler ${lote.length} recibo(s): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return todos;
  }

  private async post(lote: PushMessage[]): Promise<ExpoTicket[]> {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
      },
      body: JSON.stringify(
        lote.map((m) => ({
          to: m.to,
          title: m.title,
          body: m.body,
          data: { url: m.url },
          sound: 'default',
          channelId: PUSH_CHANNEL_ID,
        })),
      ),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Expo respondeu ${res.status}`);
    const json = (await res.json()) as { data?: ExpoTicket[] };
    return Array.isArray(json.data) ? json.data : [];
  }
}
