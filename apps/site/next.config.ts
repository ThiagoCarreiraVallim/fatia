import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Export estático: o build cospe HTML/CSS/JS em `out/`, servido por nginx.
  // Não há Node em runtime — diferente do PWA (`apps/web`), que usa
  // `output: 'standalone'` porque precisa de sessão e SSR.
  output: 'export',
  // Sem servidor Next, o otimizador de imagens não existe.
  images: { unoptimized: true },
  // Gera `/claude-connect/index.html` em vez de `/claude-connect.html`, que é o
  // que o nginx serve corretamente sem regra extra.
  trailingSlash: true,
};

export default nextConfig;
