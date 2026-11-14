import type { Metadata, Viewport } from 'next';
import { Manrope, Sora } from 'next/font/google';
import { palettes } from '@fatia/design';
import './globals.css';
import { Providers } from './providers';
import { ServiceWorkerRegister } from '@/components/sw-register';
import { THEME_SCRIPT } from '@/lib/theme-script';

// DS v2 "Noite" (#368): Manrope no texto, Sora em números e títulos. O
// next/font serve as fontes do próprio domínio (nada vai ao Google no acesso).
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-manrope',
});
const sora = Sora({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-sora' });

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
