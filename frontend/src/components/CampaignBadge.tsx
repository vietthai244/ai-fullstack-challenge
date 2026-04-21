// frontend/src/components/CampaignBadge.tsx
//
// Phase 9 (UI-06/08/TEST-05): Status badge for campaign states.
// Uses `satisfies Record<CampaignStatus, ...>` for compile-time exhaustiveness (m1 guard).
// If a 5th status is added to CampaignStatus, TypeScript errors here before runtime.
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CampaignStatus } from '@campaign/shared';

interface CampaignBadgeProps {
  status: CampaignStatus;
}

const STATUS_CONFIG = {
  draft:     { label: 'Draft',     className: 'bg-gray-100 text-gray-600 border-gray-200' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  sending:   { label: 'Sending',   className: 'bg-amber-100 text-amber-700 border-amber-200' },
  sent:      { label: 'Sent',      className: 'bg-green-100 text-green-700 border-green-200' },
} as const satisfies Record<CampaignStatus, { label: string; className: string }>;

export function CampaignBadge({ status }: CampaignBadgeProps): React.ReactElement {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={cn('gap-1', config.className)}>
      {status === 'sending' && (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      )}
      {config.label}
    </Badge>
  );
}
