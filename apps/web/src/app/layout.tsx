import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { palettes } from '@fatia/design';
import './globals.css';
import { Providers } from './providers';
import { ServiceWorkerRegister } from '@/components/sw-register';
import { THEME_SCRIPT } from '@/lib/theme-script';

// DS v2 "Noite" (#368): Manrope no texto, Sora em números e títulos. As fontes
// ficam no repositório (variáveis, subconjunto latin, licença OFL em ./fonts):
// com `next/font/google` o build baixava do Google e falhava sempre que a
// resposta vinha vazia — derrubou o CI várias vezes e um deploy de produção.
const manrope = localFont({
  src: './fonts/manrope-latin.woff2',
  weight: '200 800',
  variable: '--font-manrope',
  display: 'swap',
});
const sora = localFont({
  src: './fonts/sora-latin.woff2',
  weight: '100 800',
  variable: '--font-sora',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Fatia',
  description: 'Tracking de nutrição e treino',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Fatia',
  },
  icons: {
    icon: '/icons/icon.png',
    apple: '/icons/icon.png',
  },
};

export const viewport: Viewport = {
  // Uma cor por tema do sistema; a escolha manual (Perfil > Aparência) troca as
  // duas pelo script do <head>.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: palettes.light.background },
    { media: '(prefers-color-scheme: dark)', color: palettes.dark.background },
  ],
  width: 'device-width',
  initialScale: 1,
  // Sem `maximumScale`: travar o zoom tira de quem enxerga mal o único jeito de
  // ler um número pequeno (WCAG 1.4.4). O zoom automático do iOS ao focar um
  // campo não acontece porque os campos têm 16 px no celular (`ui/input.tsx`).
  // Conteúdo até as bordas no PWA instalado; os paddings de área segura do
  // layout `(app)` e da `bottom-nav` devolvem o espaço do notch e do indicador.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning`: o script abaixo grava `data-theme` no <html>
    // antes do React hidratar, de propósito (ADR 041).
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${manrope.variable} ${sora.variable} font-sans`}>
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
