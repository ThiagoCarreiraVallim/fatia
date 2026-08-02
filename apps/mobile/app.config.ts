import type { ExpoConfig } from 'expo/config';

/**
 * Configuração do app nativo.
 *
 * É `.ts` e não `app.json` porque o `scheme` e o bundle identifier mudam entre
 * ambientes, e porque o retorno do login OAuth depende do `scheme` estar
 * registrado nos dois sistemas — deixar isso implícito num JSON é como se perde
 * meia hora depurando um callback que nunca volta.
 */

/** Scheme do deep link. Precisa bater com o redirect URI cadastrado no Logto. */
const SCHEME = 'fatia';

const config: ExpoConfig = {
  name: 'Fatia',
  slug: 'fatia',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: SCHEME,
  userInterfaceStyle: 'dark',
  // O PWA é dark-only (`html.dark` fixo em apps/web). O app segue igual: uma
  // paleta só, sem tema claro pela metade.
  backgroundColor: '#131313',
  icon: './assets/icon.png',
  // A splash não é mais chave de topo no SDK 57 — é configuração do plugin
  // `expo-splash-screen`, mais abaixo.
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'br.ia.fat.app',
  },
  android: {
    package: 'br.ia.fat.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#131313',
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    [
      // Scanner de código de barras (#140). O texto é o que a loja e o próprio
      // sistema mostram no diálogo de permissão; genérico ("o app precisa da
      // câmera") é motivo de recusa na revisão da App Store, e a pessoa também
      // merece saber que nada é gravado.
      'expo-camera',
      {
        cameraPermission:
          'O Fatia usa a câmera para ler o código de barras de produtos embalados. Nenhuma foto é tirada ou armazenada.',
        // O scanner não grava vídeo nem áudio; desligar aqui evita que o
        // aplicativo peça microfone que nunca vai usar.
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#131313',
        image: './assets/splash.png',
        imageWidth: 160,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {},
    eas: {
      // Preenchido por `eas init`. Sem isto o EAS Build não sabe a qual projeto
      // o app pertence — ver apps/mobile/README.md.
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
};

export default config;
