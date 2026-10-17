/**
 * Os arquivos que provam à Apple e ao Google que este domínio pode abrir o app
 * nativo no link de convite (`/c/<token>`). Sem `APPLE_TEAM_ID` ou
 * `ANDROID_CERT_SHA256` não há o que provar, e a rota responde 404 — o link
 * continua abrindo o PWA.
 */
export const APP_ID = 'br.ia.fat.app';
export const INVITE_PATHS = '/c/*';

export function appleAppSiteAssociation(teamId: string | undefined) {
  if (!teamId) return null;
  return {
    applinks: {
      details: [{ appIDs: [`${teamId}.${APP_ID}`], components: [{ '/': INVITE_PATHS }] }],
    },
  };
}

/** `ANDROID_CERT_SHA256` aceita mais de uma impressão, separadas por vírgula (upload e loja). */
export function androidAssetLinks(certs: string | undefined) {
  const fingerprints = (certs ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  if (fingerprints.length === 0) return null;
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: APP_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}
