// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import icon from 'astro-icon';

const DOMAIN = process.env.PUBLIC_DOMAIN ?? 'fat.ia.br';

export default defineConfig({
  // Site institucional + landing do conector. Estático por definição: o Astro
  // não manda JS para o cliente a menos que se peça explicitamente, e aqui não
  // há nenhuma ilha interativa.
  output: 'static',
  site: `https://${DOMAIN}`,
  // `directory` gera /claude-connect/index.html, que é o que o nginx serve
  // direto pelo try_files (ver infra/site.nginx.conf).
  build: { format: 'directory' },
  integrations: [
    tailwind({ applyBaseStyles: false }),
    // Inlina os SVGs do Lucide em build time — sem runtime, sem request extra.
    icon({ include: { lucide: ['*'] } }),
  ],
  devToolbar: { enabled: false },
});
