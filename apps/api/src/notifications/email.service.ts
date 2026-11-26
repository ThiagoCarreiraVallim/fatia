import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { isDemoEmail } from '../common/demo';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Cabeçalhos extras (ex.: `List-Unsubscribe` do comunicado, RFC 8058). */
  headers?: Record<string, string>;
}

/**
 * E-mail que a própria API manda (convite de comunidade). Verificação de conta
 * e "esqueci a senha" continuam com o Logto.
 *
 * Sem `MAIL_SMTP_URL` não envia e não falha: o convite continua valendo pelo
 * link, que quem convidou recebe na resposta para copiar. Falha de envio
 * também não derruba quem chamou — devolve `false` e fica no log.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transport: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const url = config.get<string>('MAIL_SMTP_URL');
    this.transport = url ? createTransport(url) : null;
    this.from = config.get<string>('EMAIL_FROM') ?? 'Fatia <nao-responda@fatia.local>';
  }

  get enabled(): boolean {
    return this.transport !== null;
  }

  async send(message: EmailMessage): Promise<boolean> {
    // A aluna fictícia da demo (#412) não recebe e-mail. O domínio `.invalid`
    // já não entrega, mas o servidor de envio nem chega a ser chamado.
    if (isDemoEmail(message.to)) return false;
    if (!this.transport) {
      this.logger.log(`E-mail não enviado (MAIL_SMTP_URL vazio): "${message.subject}"`);
      return false;
    }
    try {
      await this.transport.sendMail({ from: this.from, ...message });
      return true;
    } catch (err) {
      this.logger.warn(`Falha ao enviar "${message.subject}": ${(err as Error).message}`);
      return false;
    }
  }
}
