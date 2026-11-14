import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DesignSystemGallery } from '@/components/design-system/gallery';

export const metadata: Metadata = {
  title: 'Design system',
  robots: { index: false, follow: false },
};

/**
 * Galeria do DS v2 (#368) para revisar componentes nos dois temas, no
 * `ui:snap` e no teste de acessibilidade. Fora de produção: em produção é 404,
 * e nenhuma tela liga para cá.
 */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DesignSystemGallery />;
}
