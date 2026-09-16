import type { Config } from 'tailwindcss';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import preset from '@booking/config/tailwind-preset.js';

const config: Config = {
  presets: [preset as Partial<Config>],
  content: [
    './src/**/*.{ts,tsx,mdx}',
    // Include the shared UI package so its utility classes are generated.
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
