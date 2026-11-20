import { Component, useEffect, type ComponentType, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { requireOptionalNativeModule } from 'expo';
import { isYoutubeEmbedNavigation, youtubeEmbedUrl } from '@fatia/api-client';
import { colors } from '@/theme/colors';

/**
 * Os players de verdade, dentro do app.
 *
 * - YouTube: `react-native-webview` com o embed do `youtube-nocookie`.
 * - Vídeo da comunidade (URL assinada, MP4/MOV): `expo-video`.
 *
 * As duas bibliotecas fazem parte do Expo Go do SDK 57
 * (`expo/bundledNativeModules.json`), mas um build que não as traga não pode
 * quebrar a sessão de treino. Por isso o módulo é carregado sob demanda e, se
 * faltar o nativo (ou o player falhar ao montar), quem chama recebe
 * `onUnavailable` e volta ao caminho antigo: abrir no navegador do sistema.
 */

type WebViewModule = typeof import('react-native-webview');
type VideoModule = typeof import('expo-video');

let webViewModule: WebViewModule | null | undefined;
function loadWebView(): WebViewModule | null {
  if (webViewModule !== undefined) return webViewModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    webViewModule = require('react-native-webview') as WebViewModule;
  } catch {
    webViewModule = null;
  }
  return webViewModule;
}

let videoModule: VideoModule | null | undefined;
function loadVideo(): VideoModule | null {
  if (videoModule !== undefined) return videoModule;
  try {
    videoModule = requireOptionalNativeModule('ExpoVideo')
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require('expo-video') as VideoModule)
      : null;
  } catch {
    videoModule = null;
  }
  return videoModule;
}

/** Erro ao montar o player nativo vira fallback, nunca tela vermelha. */
class PlayerBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Unavailable({ onUnavailable }: { onUnavailable: () => void }) {
  useEffect(() => onUnavailable(), [onUnavailable]);
  return null;
}

export function YouTubePlayer({
  videoId,
  onUnavailable,
}: {
  videoId: string;
  onUnavailable: () => void;
}) {
  const mod = loadWebView();
  const uri = youtubeEmbedUrl(videoId);
  if (!mod || !uri) return <Unavailable onUnavailable={onUnavailable} />;
  const WebView = mod.WebView as unknown as ComponentType<Record<string, unknown>>;
  return (
    <PlayerBoundary onError={onUnavailable}>
      <WebView
        // O YouTube recusa o embed sem `Referer` (erro 153): o app se apresenta
        // como a própria origem do embed.
        source={{ uri, headers: { Referer: 'https://www.youtube-nocookie.com/' } }}
        style={{ flex: 1, backgroundColor: '#000' }}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        startInLoadingState
        renderLoading={() => (
          <View className="absolute inset-0 items-center justify-center bg-black">
            <ActivityIndicator color={colors.foreground} />
          </View>
        )}
        onShouldStartLoadWithRequest={(req: { url: string }) => {
          if (isYoutubeEmbedNavigation(req.url)) return true;
          void WebBrowser.openBrowserAsync(req.url);
          return false;
        }}
        onError={onUnavailable}
      />
    </PlayerBoundary>
  );
}

export function CommunityVideoPlayer({
  url,
  onUnavailable,
}: {
  url: string;
  onUnavailable: () => void;
}) {
  const mod = loadVideo();
  if (!mod) return <Unavailable onUnavailable={onUnavailable} />;
  return (
    <PlayerBoundary onError={onUnavailable}>
      <NativeVideo mod={mod} url={url} onUnavailable={onUnavailable} />
    </PlayerBoundary>
  );
}

function NativeVideo({
  mod,
  url,
  onUnavailable,
}: {
  mod: VideoModule;
  url: string;
  onUnavailable: () => void;
}) {
  const player = mod.useVideoPlayer(url, (p) => {
    p.play();
  });
  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') onUnavailable();
    });
    return () => sub.remove();
  }, [player, onUnavailable]);
  const { VideoView } = mod;
  return (
    <VideoView
      player={player}
      style={{ flex: 1, backgroundColor: '#000' }}
      contentFit="contain"
      nativeControls
    />
  );
}
