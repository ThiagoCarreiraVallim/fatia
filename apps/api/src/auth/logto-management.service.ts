import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Cliente mínimo da Management API do Logto: apagar a identidade quando o
 * usuário apaga a conta (issue #95, direito de eliminação da LGPD) e ler e-mail e
 * nome no provisionamento, que o access token não traz.
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

  /**
   * E-mail e nome do usuário no Logto, pelo `sub`.
   *
   * Existe porque o **access token** do Logto não carrega `email` nem `name` —
   * só o ID token carrega, e a API nunca o vê. Sem isto todo usuário nascia como
   * `<sub>@logto.local`, com o `sub` no lugar do nome. `null` quando não está
   * configurado ou o Logto falha: quem chama mantém o que já tinha.
   */
  async getUserProfile(
    logtoSub: string,
  ): Promise<{ email: string | null; name: string | null } | null> {
    if (!this.isConfigured()) return null;
    try {
      const token = await this.fetchAccessToken();
      if (!token) return null;
      const response = await fetch(`${this.endpoint()}/api/users/${encodeURIComponent(logtoSub)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        this.logger.warn(`Perfil do usuário no Logto indisponível: ${response.status}`);
        return null;
      }
      const user = (await response.json()) as {
        primaryEmail?: string | null;
        name?: string | null;
        username?: string | null;
      };
      return { email: user.primaryEmail ?? null, name: user.name ?? user.username ?? null };
    } catch (err) {
      this.logger.warn(
        `Erro ao ler perfil no Logto: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /** O nome editado no app, também no Logto (ID token e tela do Logto). */
  async updateUserName(logtoSub: string, name: string): Promise<boolean> {
    const res = await this.request('PATCH', `/api/users/${encodeURIComponent(logtoSub)}`, { name });
    return res?.ok ?? false;
  }

  /** Confere a senha atual (troca de e-mail). `false` também quando o Logto falha. */
  async verifyPassword(logtoSub: string, password: string): Promise<boolean> {
    const res = await this.request(
      'POST',
      `/api/users/${encodeURIComponent(logtoSub)}/password/verify`,
      { password },
    );
    return res?.status === 204 || res?.status === 200;
  }

  /** Código de verificação para um e-mail, pelo conector SMTP do Logto. */
  async sendEmailCode(email: string): Promise<void> {
    const res = await this.request('POST', '/api/verification-codes', { email });
    if (!res?.ok) throw new Error(`Logto não enviou o código (${res?.status ?? 'sem resposta'})`);
  }

  async verifyEmailCode(email: string, verificationCode: string): Promise<boolean> {
    const res = await this.request('POST', '/api/verification-codes/verify', {
      email,
      verificationCode,
    });
    return res?.ok ?? false;
  }

  /**
   * O `sub` da conta do Logto com este e-mail principal, ou `null`. Lança se o
   * Logto não responder: quem chama decide fechar (não arriscar).
   */
  async findUserIdByEmail(email: string): Promise<string | null> {
    const q = new URLSearchParams({ 'search.primaryEmail': email, 'mode.primaryEmail': 'exact' });
    const res = await this.request('GET', `/api/users?${q.toString()}`);
    if (!res?.ok) throw new Error(`Logto não respondeu a busca (${res?.status ?? 'sem resposta'})`);
    const users = (await res.json()) as Array<{ id: string; primaryEmail?: string | null }>;
    const hit = users.find((u) => u.primaryEmail?.toLowerCase() === email);
    return hit?.id ?? null;
  }

  async updatePrimaryEmail(
    logtoSub: string,
    primaryEmail: string,
  ): Promise<'ok' | 'in_use' | 'failed'> {
    const res = await this.request('PATCH', `/api/users/${encodeURIComponent(logtoSub)}`, {
      primaryEmail,
    });
    if (res?.ok) return 'ok';
    if (res?.status === 422) return 'in_use';
    return 'failed';
  }

  /** Uma chamada autenticada à Management API; `null` sem credenciais ou sem rede. */
  private async request(method: string, path: string, body?: unknown): Promise<Response | null> {
    if (!this.isConfigured()) return null;
    try {
      const token = await this.fetchAccessToken();
      if (!token) return null;
      const res = await fetch(`${this.endpoint()}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok && res.status >= 500) {
        this.logger.warn(`Management API ${method} ${path.split('/')[2]}: ${res.status}`);
      }
      return res;
    } catch (err) {
      this.logger.warn(
        `Erro na Management API: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
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
