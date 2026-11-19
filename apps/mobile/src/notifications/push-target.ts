import { notificationTarget } from '@fatia/api-client';
import { MOBILE_MISSING_SECTIONS } from '@/components/org/panel-sections';

const PANEL_PATH = /^\/org\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)(?:\/.*)?$/;

/**
 * Para onde o toque no aviso leva no app: `notificationTarget`, mais um
 * desvio para as telas do painel que o app ainda não tem (#399, #401): o
 * aviso diário do Em risco, por exemplo, abre o painel da comunidade até a
 * #414. Nunca uma rota que não existe no app.
 */
export function mobilePushTarget(data: unknown): string | null {
  const url = notificationTarget(data);
  if (!url) return null;
  const m = url.match(PANEL_PATH);
  if (m && (MOBILE_MISSING_SECTIONS as readonly string[]).includes(m[2]!)) return `/org/${m[1]}`;
  return url;
}
