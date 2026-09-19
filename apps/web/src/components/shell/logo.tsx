import Image from 'next/image';

/**
 * Midwest Identity Services wordmark. The asset is a white logo on a solid
 * black field, so it reads on both light and dark surfaces without a wrapper.
 * Height is controlled by the caller via `className` (e.g. "h-8 w-auto").
 */
export function Logo({
  className = 'h-8 w-auto',
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/midwest-identity-services.png"
      alt="Midwest Identity Services"
      width={1024}
      height={257}
      priority={priority}
      className={className}
    />
  );
}
