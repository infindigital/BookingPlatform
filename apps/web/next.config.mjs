/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Consume the shared UI package as source (no separate build step).
  transpilePackages: ['@booking/ui'],
};

export default nextConfig;
