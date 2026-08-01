import * as Linking from 'expo-linking';
import { env } from '@/env';

/**
 * Endereço do app web, onde vivem as páginas legais.
 *
 * No PWA `/privacy` e `/terms` são rotas da própria aplicação; o app nativo não
 * as reimplementa — abre o navegador do sistema. A base é derivada de
 * `env.apiUrl` (`api.dominio` → `app.dominio`) para que uma instância
 * auto-hospedada aponte para o domínio dela, e cai no oficial quando a API não
 * segue esse padrão — que é o caso do `localhost` em desenvolvimento.
 */
const OFFICIAL_WEB_APP_URL = 'https://app.fat.ia.br';

export function webAppUrl(): string {
  const match = /^(https?:\/\/)api\.(.+)$/.exec(env.apiUrl);
  return match ? `${match[1]}app.${match[2]}` : OFFICIAL_WEB_APP_URL;
}

export type LegalPath = '/privacy' | '/terms';

export function legalUrl(path: LegalPath): string {
  return `${webAppUrl()}${path}`;
}

export function openLegal(path: LegalPath): void {
  void Linking.openURL(legalUrl(path));
}
