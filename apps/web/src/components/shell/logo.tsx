import Image from 'next/image';

/**
 * Midwest Identity Services wordmark. The asset is white on a transparent
 * background, so it needs a tone hint to stay visible on light surfaces:
 *
 *  - tone="adaptive" (default): dark in light theme, white in dark theme
 *    (via CSS invert). Use on themed admin surfaces (sidebar, cards).
 *  - tone="onDark": always white, no inversion. Use on permanently dark
 *    backgrounds (the hero, the login marketing panel).
 *
 * Height is controlled by the caller via `className` (e.g. "h-8 w-auto").
 */
const TONE_CLASS: Record<'adaptive' | 'onDark', string> = {
  adaptive: 'invert dark:invert-0',
  onDark: '',
};

export function Logo({
  className = 'h-8 w-auto',
  priority = false,
  tone = 'adaptive',
}: {
  className?: string;
  priority?: boolean;
  tone?: 'adaptive' | 'onDark';
}) {
  return (
    <Image
      src="/brand/Midwest-Logo-Identity-Services-White.webp"
      alt="Midwest Identity Services"
      width={1101}
      height={276}
      priority={priority}
      className={`${className} ${TONE_CLASS[tone]}`.trim()}
    />
  );
}
