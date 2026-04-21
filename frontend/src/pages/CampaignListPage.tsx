// frontend/src/pages/CampaignListPage.tsx
//
// Phase 9 (UI-06): Campaign list with offset-based infinite scroll.
// CRITICAL: GET /campaigns uses OFFSET pagination (page/limit/totalPages).
// There is NO nextCursor field. getNextPageParam reads pagination.page < pagination.totalPages.
// Using nextCursor would always return undefined → hasNextPage = false → no load more.
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useCallback, useRef } from 'react';
import { api } from '@/lib/apiClient';
import { CampaignBadge } from '@/components/CampaignBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { CampaignStatus } from '@campaign/shared';

type Campaign = {
  id: string;
  name: string;
  subject: string;
  status: CampaignStatus;
  createdAt: string;
};

type CampaignPage = {
  data: Campaign[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

function CampaignListSkeleton(): React.ReactElement {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
      <p className="text-lg font-semibold">No campaigns yet</p>
      <p className="text-sm text-muted-foreground">
        Create your first campaign to get started.
      </p>
      <Button variant="default" onClick={onNew}>
        New Campaign
      </Button>
    </div>
  );
}

export function CampaignListPage(): React.ReactElement {
  const navigate = useNavigate();

  // CRITICAL: initialPageParam: 1 is REQUIRED in React Query v5.
  // getNextPageParam reads pagination.page and pagination.totalPages — NOT nextCursor.
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
  } = useInfiniteQuery<CampaignPage>({
    queryKey: ['campaigns'],
    queryFn: async ({ pageParam }) => {
      const res = await api.get<CampaignPage>(
        `/campaigns?page=${pageParam as number}&limit=20`,
      );
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
  });

  // IntersectionObserver sentinel — triggers fetchNextPage when sentinel enters viewport.
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isFetchingNextPage) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting && hasNextPage) void fetchNextPage();
      });
      if (node) observerRef.current.observe(node);
    },
    [isFetchingNextPage, hasNextPage, fetchNextPage],
  );

  if (isPending || !data) return <CampaignListSkeleton />;

  const campaigns = data.pages.flatMap((page) => page.data);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Campaigns</h1>
        <Button variant="default" onClick={() => navigate('/campaigns/new')}>
          New Campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState onNew={() => navigate('/campaigns/new')} />
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <Card
              key={campaign.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate(`/campaigns/${campaign.id}`)}
            >
              <CardContent className="flex items-center justify-between py-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{campaign.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(campaign.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <CampaignBadge status={campaign.status} />
              </CardContent>
            </Card>
          ))}
          {/* Sentinel div — IntersectionObserver attaches here to trigger fetchNextPage */}
          <div ref={sentinelRef} aria-hidden="true" />
          {isFetchingNextPage && (
            <Skeleton className="h-20 w-full rounded-lg" />
          )}
        </div>
      )}
    </div>
  );
}
