import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Cliente mínimo da Management API do Logto — hoje só para apagar a identidade
 * quando o usuário apaga a conta (issue #95, direito de eliminação da LGPD).
 *
 * As credenciais são opcionais de propósito. Uma instância self-hosted que não as
 * configure continua funcionando: a conta e todos os dados são apagados do
 * Postgres normalmente, e só a identidade no Logto sobrevive — sem dar acesso a
 * nada, porque o `User` que ela resolveria não existe mais. Exigir as credenciais
 * transformaria "não configurei a Management API" em "ninguém consegue apagar a
 * conta", que é o pior dos dois lados.
 */
@Injectable()
export class LogtoManagementService {
  private readonly logger = new Logger(LogtoManagementService.name);

  constructor(private readonly config: ConfigService) {}

  /** True se as credenciais da Management API estão configuradas. */
  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('LOGTO_M2M_APP_ID') &&
      this.config.get<string>('LOGTO_M2M_APP_SECRET'),
    );
  }

  /**
   * Apaga o usuário no Logto pelo `sub`. Retorna `false` — sem lançar — quando não
   * está configurado ou quando o Logto recusa: o chamador decide o que fazer, e no
   * caso da deleção de conta o cascade local já garantiu o essencial.
   */
  async deleteUser(logtoSub: string): Promise<boolean> {
    if (!this.isConfigured()) {
      this.logger.warn(
        'LOGTO_M2M_APP_ID/SECRET não configurados: a identidade no Logto não será apagada. ' +
          'Os dados locais são apagados normalmente.',
      );
      return false;
    }

    try {
      const token = await this.fetchAccessToken();
      if (!token) return false;

      const endpoint = this.endpoint();
      const response = await fetch(`${endpoint}/api/users/${encodeURIComponent(logtoSub)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      // 404 conta como sucesso: a identidade já não existe, que é o estado desejado.
      if (response.ok || response.status === 404) return true;

      this.logger.error(
        `Falha ao apagar usuário no Logto: ${response.status} ${await response.text()}`,
      );
      return false;
    } catch (err) {
      this.logger.error(
        `Erro ao chamar a Management API do Logto: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  private endpoint(): string {
    return this.config.getOrThrow<string>('LOGTO_ENDPOINT').replace(/\/+$/, '');
  }

  /** Client credentials grant contra o resource da Management API do Logto. */
  private async fetchAccessToken(): Promise<string | null> {
    const endpoint = this.endpoint();
    const appId = this.config.getOrThrow<string>('LOGTO_M2M_APP_ID');
    const appSecret = this.config.getOrThrow<string>('LOGTO_M2M_APP_SECRET');
    const resource =
      this.config.get<string>('LOGTO_MANAGEMENT_RESOURCE') ?? 'https://default.logto.app/api';

    const response = await fetch(`${endpoint}/oidc/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        resource,
        scope: 'all',
      }),
    });

    if (!response.ok) {
      this.logger.error(
        `Falha ao obter token da Management API: ${response.status} ${await response.text()}`,
      );
      return null;
    }

    const data = (await response.json()) as { access_token?: string };
    return data.access_token ?? null;
  }
}
