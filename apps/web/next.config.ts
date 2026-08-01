import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O pacote é consumido como TypeScript, sem build próprio — os dois apps o
  // compilam com o seu próprio pipeline. Sem isto o Next ignora o `src/*.ts`
  // dentro de node_modules e o build quebra.
  transpilePackages: ['@fatia/api-client'],
  // Standalone produz um build com node_modules mínimos pra rodar em Docker.
  output: 'standalone',
};

export default nextConfig;
