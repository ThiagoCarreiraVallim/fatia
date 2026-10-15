import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { ServiceWorkerRegister } from '@/components/sw-register';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['800'],
  variable: '--font-jakarta',
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
  themeColor: '#131313',
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
    <html lang="pt-BR" className="dark">
      <body className={`${inter.variable} ${jakarta.variable} font-sans`}>
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
