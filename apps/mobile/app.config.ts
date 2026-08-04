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
      // Câmera: scanner de código de barras (#140) e registro por foto (#139).
      // O texto é o que a loja e o próprio sistema mostram no diálogo de
      // permissão; genérico ("o app precisa da câmera") é motivo de recusa na
      // revisão da App Store.
      //
      // O texto mudou com a #139 e a mudança **não é cosmética**: enquanto só
      // havia o scanner, ele dizia "nenhuma foto é tirada ou armazenada", e isso
      // deixou de ser verdade — agora uma foto é tirada e sai do aparelho. Um
      // texto de permissão que descreve errado o que o app faz é exatamente o
      // que a revisão da loja procura, e é o tipo de mentira que sobrevive
      // porque ninguém volta para reler.
      'expo-camera',
      {
        cameraPermission:
          'O Fatia usa a câmera para ler códigos de barras e para reconhecer a refeição em uma foto do prato. A foto é analisada e descartada — ela não é salva no Fatia.',
        // Nem o scanner nem o registro por foto gravam vídeo ou áudio; desligar
        // aqui evita que o aplicativo peça microfone que nunca vai usar.
        recordAudioAndroid: false,
      },
    ],
    [
      // Galeria (#139): a issue pede câmera **e** galeria, para quem fotografou
      // o prato antes de abrir o app. Só leitura — o Fatia nunca escreve na
      // galeria, e por isso não pede a permissão de gravação.
      'expo-image-picker',
      {
        photosPermission:
          'O Fatia acessa suas fotos para você escolher a imagem de uma refeição já fotografada. A imagem é analisada e descartada — ela não é salva no Fatia.',
      },
    ],
    [
      // Notificação local do fim do descanso (#182). Só `color`, que é o tom da
      // marca na bandeja do Android. O `icon` fica de fora porque o plugin pede
      // um PNG 96x96 branco com transparência, e o que existe em `assets/` é
      // colorido — entregue assim, o Android desenha um quadrado branco. Sem a
      // chave, ele usa o ícone do app, que é o menos pior até alguém desenhar o
      // monocromático.
      'expo-notifications',
      { color: '#2ce500' },
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
