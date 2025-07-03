import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ['ioredis'],
  images: {
    domains: ['localhost'],
  },
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:4000']
    }
  }
};

export default nextConfig;
