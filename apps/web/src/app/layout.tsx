import type { Metadata, Viewport } from 'next';
import { demoConfig } from '@/config/demo';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: demoConfig.productName,
    template: `%s · ${demoConfig.productName}`,
  },
  description: demoConfig.tagline,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1117' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
