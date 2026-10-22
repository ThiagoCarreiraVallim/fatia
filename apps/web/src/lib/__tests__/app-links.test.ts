import { describe, expect, it } from 'vitest';
import { androidAssetLinks, appleAppSiteAssociation } from '../app-links';

describe('links universais do convite', () => {
  it('sem as chaves, não há arquivo', () => {
    expect(appleAppSiteAssociation(undefined)).toBeNull();
    expect(androidAssetLinks(undefined)).toBeNull();
    expect(androidAssetLinks(' , ')).toBeNull();
  });

  it('a Apple recebe o app e só o caminho do convite', () => {
    expect(appleAppSiteAssociation('ABCDE12345')).toEqual({
      applinks: {
        details: [{ appIDs: ['ABCDE12345.br.ia.fat.app'], components: [{ '/': '/c/*' }] }],
      },
    });
  });

  it('o Android recebe o pacote e cada impressão do certificado', () => {
    const [link] = androidAssetLinks('AA:BB, CC:DD')!;
    expect(link.target).toEqual({
      namespace: 'android_app',
      package_name: 'br.ia.fat.app',
      sha256_cert_fingerprints: ['AA:BB', 'CC:DD'],
    });
  });
});
