import type { BookingStatus } from '@booking/db';
import { Badge } from '@booking/ui/badge';
import { statusMeta } from './format';

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { label, tone } = statusMeta(status);
  return <Badge tone={tone}>{label}</Badge>;
}
