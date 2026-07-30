import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { site } from '@/lib/site';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(`https://${site.domain}`),
  title: {
    default: 'Fatia — nutrição e treino, direto no Claude',
    template: '%s — Fatia',
  },
  description:
    'Registre refeições e treinos conversando com o Claude. Software livre, com a tabela TACO brasileira.',
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Fatia',
  },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
};

export const viewport: Viewport = {
  themeColor: '#131313',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${inter.variable} ${jakarta.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
