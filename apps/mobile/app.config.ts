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

/**
 * Domínio do link universal do convite (`https://<host>/c/<token>`), o mesmo do
 * PWA. Vazio, o app só abre o `fatia://c/<token>`: o link universal exige que a
 * web sirva `apple-app-site-association` e `assetlinks.json` (`APPLE_TEAM_ID`,
 * `ANDROID_CERT_SHA256`), e um domínio declarado sem eles só confunde o sistema.
 */
const APP_LINKS_HOST = process.env.APP_LINKS_HOST;

/**
 * `google-services.json` do Firebase: sem ele o Android não emite token de push
 * (ADR 033) e Perfil → Notificações falha ao ligar. Não vai para o git; no build
 * da EAS chega como variável do tipo arquivo, que entrega o caminho do arquivo
 * — ver docs/TESTAR_O_APP.md.
 */
const GOOGLE_SERVICES_JSON = process.env.GOOGLE_SERVICES_JSON;

/** O projeto `@fat.ia.br/fatia` na EAS. */
const EAS_PROJECT_ID = 'f2f556bd-db04-4057-a788-246f00c145df';

const config: ExpoConfig = {
  name: 'Fatia',
  slug: 'fatia',
  // A conta da EAS dona do projeto (organização), e não a de quem roda o build.
  owner: process.env.EAS_OWNER ?? 'fat.ia.br',
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
    ...(APP_LINKS_HOST && { associatedDomains: [`applinks:${APP_LINKS_HOST}`] }),
  },
  android: {
    package: 'br.ia.fat.app',
    ...(GOOGLE_SERVICES_JSON && { googleServicesFile: GOOGLE_SERVICES_JSON }),
    ...(APP_LINKS_HOST && {
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [{ scheme: 'https', host: APP_LINKS_HOST, pathPrefix: '/c/' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    }),
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
        // A câmera não grava áudio, mas `false` aqui **bloqueia** a permissão de
        // microfone no manifesto do Android inteiro — e o ditado do chat (Fase
        // 9e, `expo-audio`) precisa dela. A câmera continua sem pedir microfone.
        recordAudioAndroid: true,
      },
    ],
    [
      // Ditado do chat (Fase 9e): o áudio vai à transcrição e é apagado do
      // aparelho; o texto volta para o campo, e quem envia é a pessoa.
      'expo-audio',
      {
        microphonePermission:
          'O Fatia usa o microfone para você ditar mensagens ao assistente. O áudio é transcrito e descartado — ele não fica guardado.',
        enableBackgroundPlayback: false,
        enableBackgroundRecording: false,
      },
    ],
    [
      // Galeria (#139): a issue pede câmera **e** galeria, para quem fotografou
      // o prato antes de abrir o app. Só leitura — o Fatia nunca escreve na
      // galeria, e por isso não pede a permissão de gravação.
      //
      // Desde a Fase 7 a galeria também serve à equipe de uma comunidade, que
      // publica imagens e vídeos — e esses ficam guardados. O texto antigo
      // ("a imagem é descartada") deixou de ser verdade para esse caso, e é o
      // mesmo tipo de descrição errada do comentário da câmera acima. Entra no
      // próximo build nativo.
      'expo-image-picker',
      {
        photosPermission:
          'O Fatia acessa suas fotos e vídeos para você escolher a foto de uma refeição, que é analisada e descartada, ou, se você faz parte da equipe de uma comunidade, a imagem ou o vídeo que vai publicar nela.',
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
      // O projeto da EAS. Fixo, e não só do ambiente: o `eas build` avalia esta
      // configuração sem carregar o `.env`, e sem o id ele tenta "ligar" o
      // projeto escrevendo aqui — o que falha num `app.config.ts`. O id não é
      // segredo. `EAS_PROJECT_ID` ainda vence, para um fork usar o próprio.
      projectId: process.env.EAS_PROJECT_ID ?? EAS_PROJECT_ID,
    },
  },
};

export default config;
