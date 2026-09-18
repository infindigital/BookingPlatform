import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(appDir, '..', '..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Consume workspace packages as source (no separate build step).
  transpilePackages: ['@booking/ui', '@booking/core', '@booking/db'],
  // @prisma/client is a server-only external; keep it out of client bundles.
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  // Monorepo: trace files from the workspace root, not just this app, so the
  // deployment bundler can find dependencies hoisted to the root node_modules.
  outputFileTracingRoot: monorepoRoot,
  // The Prisma query-engine (`libquery_engine-*.so.node`) is loaded at runtime
  // via a computed path, so Next's static file-tracer misses it and the
  // serverless bundle ships without it ("could not locate the Query Engine").
  // Force it (and the generated client) into every API route's bundle.
  outputFileTracingIncludes: {
    '/api/**': [
      '../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/**',
      '../../node_modules/.pnpm/@prisma+client*/node_modules/@prisma/client/**',
      '../../node_modules/.prisma/client/**',
    ],
  },
};

export default nextConfig;
