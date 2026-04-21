// frontend/src/pages/CampaignDetailPage.tsx
//
// Phase 9 (UI-08/09/10/11/13): Campaign detail page.
//
// CRITICAL notes:
// 1. refetchInterval v5 signature: (query) => query.state.data?.status — NOT (data) =>
// 2. datetime-local → ISO: new Date(localString).toISOString() before POST /schedule
// 3. stats.send_rate/open_rate are decimal (0.0–1.0) — multiply by 100 for Progress value
// 4. campaign.body rendered as plain text only — never dangerouslySetInnerHTML (XSS guard T-09-05-01)
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { EmailTokenizer } from '@/components/EmailTokenizer';
import { CampaignBadge } from '@/components/CampaignBadge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type RecipientStatus = 'pending' | 'sent' | 'failed';

type CampaignDetail = {
  id: string;
  name: string;
  subject: string;
  body: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent';
  scheduledAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  stats: {
    total: number;
    sent: number;
    failed: number;
    opened: number;
    open_rate: number | null;
    send_rate: number | null;
  };
  campaignRecipients: Array<{
    status: RecipientStatus;
    sentAt: string | null;
    openedAt: string | null;
    trackingToken: string;
    recipient: { id: string; email: string; name: string };
  }>;
};

function DetailSkeleton(): React.ReactElement {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );
}

function recipientStatusClass(status: RecipientStatus): string {
  if (status === 'sent') return 'text-green-600';
  if (status === 'failed') return 'text-destructive';
  return 'text-muted-foreground';
}

export function CampaignDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Schedule action local state for the datetime-local input value
  const [scheduleInput, setScheduleInput] = useState('');

  // Controlled dialog open state — prevents AlertDialogAction from auto-closing
  // before mutation completes (CR-01 fix)
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingRecipients, setEditingRecipients] = useState(false);
  const [recipientDraft, setRecipientDraft] = useState<string[]>([]);

  // CRITICAL: v5 refetchInterval receives Query object — NOT data.
  // Using (data) => data?.status would silently return undefined → no polling.
  const { data: campaign, isPending } = useQuery<CampaignDetail>({
    queryKey: ['campaign', id],
    queryFn: async () => {
      const res = await api.get<{ data: CampaignDetail }>(`/campaigns/${id}`);
      return res.data.data;
    },
    refetchInterval: (query) => {
      return query.state.data?.status === 'sending' ? 2000 : false;
    },
    enabled: !!id,
  });

  // Schedule mutation — CRITICAL: convert datetime-local to ISO before POST
  const scheduleMutation = useMutation({
    mutationFn: (localDateString: string) =>
      api.post(`/campaigns/${id}/schedule`, {
        // datetime-local returns "2026-05-01T14:00" — no TZ. Must convert to ISO.
        scheduled_at: new Date(localDateString).toISOString(),
      }),
    onSuccess: async () => {
      toast.success('Campaign scheduled');
      setScheduleInput('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
        queryClient.invalidateQueries({ queryKey: ['campaign', id] }),
      ]);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to schedule campaign';
      toast.error(message);
    },
  });

  // Send mutation — backend atomic guard returns 409 if status not draft|scheduled.
  // CR-01 fix: close dialog only on success (setSendDialogOpen(false) here, not via
  // AlertDialogAction default behaviour which closes before the mutation fires).
  const sendMutation = useMutation({
    mutationFn: () => api.post(`/campaigns/${id}/send`),
    onSuccess: async () => {
      toast.success('Campaign sending — processing recipients');
      setSendDialogOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
        queryClient.invalidateQueries({ queryKey: ['campaign', id] }),
      ]);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to send campaign';
      toast.error(message);
    },
  });

  // Delete mutation — navigates away on success; only invalidate list (detail gone).
  // CR-01 fix: close dialog only on success.
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/campaigns/${id}`),
    onSuccess: async () => {
      setDeleteDialogOpen(false);
      toast.success('Campaign deleted');
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      navigate('/campaigns');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to delete campaign';
      toast.error(message);
    },
  });

  const updateRecipientsMutation = useMutation({
    mutationFn: (emails: string[]) =>
      api.patch(`/campaigns/${id}`, { recipientEmails: emails }),
    onSuccess: async () => {
      setEditingRecipients(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
        queryClient.invalidateQueries({ queryKey: ['campaign', id] }),
      ]);
      toast.success('Recipients updated');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to update recipients';
      toast.error(message);
    },
  });

  // WR-04: guard missing id param before query can fire with undefined
  if (!id) return <Navigate to="/campaigns" replace />;

  if (isPending) return <DetailSkeleton />;
  if (!campaign) return <p className="max-w-3xl mx-auto px-4 py-8">Campaign not found.</p>;

  const canSchedule = campaign.status === 'draft';
  const canSend = campaign.status === 'draft' || campaign.status === 'scheduled';
  // WR-02: backend DELETE guard only permits draft — align frontend to match
  const canDelete = campaign.status === 'draft';

  // Minimum datetime for schedule input — current moment (prevent past schedule in UI)
  const minDatetime = new Date().toISOString().slice(0, 16);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{campaign.name}</h1>
          <CampaignBadge status={campaign.status} />
        </div>
      </div>

      <Separator />

      {/* Stats section */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Stats
        </h2>
        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Send rate</span>
              <span>{((campaign.stats.send_rate ?? 0) * 100).toFixed(1)}%</span>
            </div>
            {/* stats.send_rate is decimal 0.0–1.0 — multiply by 100 for Progress */}
            <Progress value={(campaign.stats.send_rate ?? 0) * 100} />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Open rate</span>
              <span>{((campaign.stats.open_rate ?? 0) * 100).toFixed(1)}%</span>
            </div>
            {/* stats.open_rate is decimal 0.0–1.0 — multiply by 100 for Progress */}
            <Progress value={(campaign.stats.open_rate ?? 0) * 100} />
          </div>
          <div className="grid grid-cols-4 gap-2 text-sm text-center pt-1">
            <div>
              <span className="font-medium">{campaign.stats.total}</span>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div>
              <span className="font-medium text-green-600">{campaign.stats.sent}</span>
              <p className="text-xs text-muted-foreground">Sent</p>
            </div>
            <div>
              <span className="font-medium text-destructive">{campaign.stats.failed}</span>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
            <div>
              <span className="font-medium">{campaign.stats.opened}</span>
              <p className="text-xs text-muted-foreground">Opened</p>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Scheduled time — shown when campaign is scheduled */}
      {campaign.status === 'scheduled' && campaign.scheduledAt && (
        <p className="text-sm text-muted-foreground">
          Scheduled for{' '}
          <span className="font-medium text-foreground">
            {new Date(campaign.scheduledAt).toLocaleString()}
          </span>
        </p>
      )}

      {/* Actions section — conditional by status (exhaustive: all 4 handled) */}
      {campaign.status === 'sending' && (
        <p className="text-sm text-muted-foreground">Sending in progress...</p>
      )}

      {(canSchedule || canSend || canDelete) && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Actions
          </h2>
          <div className="flex flex-wrap gap-2">
            {/* Schedule action — inline datetime-local input + button (no AlertDialog) */}
            {canSchedule && (
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={scheduleInput}
                  min={minDatetime}
                  onChange={(e) => setScheduleInput(e.target.value)}
                  className="rounded-md border px-3 py-2 text-sm"
                />
                <Button
                  variant="outline"
                  disabled={!scheduleInput || scheduleMutation.isPending}
                  onClick={() => scheduleMutation.mutate(scheduleInput)}
                >
                  {scheduleMutation.isPending ? 'Scheduling...' : 'Schedule Campaign'}
                </Button>
              </div>
            )}

            {/* Send action — AlertDialog confirm.
                CR-01 fix: controlled open state so the dialog stays open while mutation
                is in-flight. e.preventDefault() stops Radix auto-close on action click;
                dialog closes only in sendMutation.onSuccess. */}
            {canSend && (
              <AlertDialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="default" disabled={sendMutation.isPending}>
                    Send Now
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Send campaign now?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will immediately start sending to all recipients. This action cannot be
                      undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={sendMutation.isPending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault(); // prevent Radix auto-close before mutation completes
                        sendMutation.mutate();
                      }}
                      disabled={sendMutation.isPending}
                    >
                      {sendMutation.isPending ? 'Sending...' : 'Send'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {/* Delete action — AlertDialog confirm with destructive variant.
                CR-01 fix: same controlled pattern as Send dialog above. */}
            {canDelete && (
              <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={deleteMutation.isPending}>
                    Delete Campaign
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. The campaign and all recipient data will be
                      permanently deleted.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault(); // prevent Radix auto-close before mutation completes
                        deleteMutation.mutate();
                      }}
                      disabled={deleteMutation.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      )}

      <Separator />

      {/* Campaign body — NEVER dangerouslySetInnerHTML (XSS guard T-09-05-01) */}
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Subject
        </h2>
        <p className="text-sm">{campaign.subject}</p>
      </div>
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Body
        </h2>
        <p className="text-sm whitespace-pre-wrap">{campaign.body}</p>
      </div>

      <Separator />

      {/* Recipients list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Recipients ({campaign.stats.total})
          </h2>
          {campaign.status === 'draft' && !editingRecipients && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRecipientDraft(campaign.campaignRecipients.map((cr) => cr.recipient.email));
                setEditingRecipients(true);
              }}
            >
              Edit recipients
            </Button>
          )}
        </div>

        {editingRecipients ? (
          <div className="space-y-2">
            <EmailTokenizer value={recipientDraft} onChange={setRecipientDraft} />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={updateRecipientsMutation.isPending}
                onClick={() => updateRecipientsMutation.mutate(recipientDraft)}
              >
                {updateRecipientsMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={updateRecipientsMutation.isPending}
                onClick={() => setEditingRecipients(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            {campaign.campaignRecipients.map((cr) => (
              <div key={cr.trackingToken} className="flex items-center justify-between text-sm py-1">
                <span>{cr.recipient.email}</span>
                <span className={recipientStatusClass(cr.status)}>
                  {cr.status}
                  {cr.sentAt ? ` · ${new Date(cr.sentAt).toLocaleDateString()}` : ''}
                </span>
              </div>
            ))}
            {campaign.campaignRecipients.length === 0 && (
              <p className="text-sm text-muted-foreground">No recipients.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
