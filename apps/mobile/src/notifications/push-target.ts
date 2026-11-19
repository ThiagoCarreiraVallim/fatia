import { notificationTarget } from '@fatia/api-client';

/**
 * Telas da web que o app ainda não tem, e para onde o toque cai no lugar
 * (#399): o "Para revisar" e o Em risco do painel abrem o painel da comunidade
 * até a #414. Nunca uma rota que não existe no app.
 */
const MOBILE_FALLBACK: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^\/org\/([A-Za-z0-9_-]+)\/review(?:\/.*)?$/, (m) => `/org/${m[1]}`],
];

/** Para onde o toque no aviso leva no app: `notificationTarget` mais o desvio acima. */
export function mobilePushTarget(data: unknown): string | null {
  const url = notificationTarget(data);
  if (!url) return null;
  for (const [re, to] of MOBILE_FALLBACK) {
    const m = url.match(re);
    if (m) return to(m);
  }
  return url;
}
