import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Standalone produz um build com node_modules mínimos pra rodar em Docker.
  output: 'standalone',
};

export default nextConfig;
