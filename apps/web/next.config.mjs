/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Consume workspace packages as source (no separate build step).
  transpilePackages: ['@booking/ui', '@booking/core', '@booking/db'],
  // @prisma/client is a server-only external; keep it out of client bundles.
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
};

export default nextConfig;
