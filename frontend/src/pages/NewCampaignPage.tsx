// frontend/src/pages/NewCampaignPage.tsx
//
// Phase 9 (UI-07): New campaign creation form.
// Zod-validated via react-hook-form + @hookform/resolvers/zod.
// EmailTokenizer uses comma/Enter key to convert typed text to email chip tokens.
// On success: invalidates ['campaigns'] query + navigates to /campaigns/:id.
import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/apiClient';
import { CreateCampaignSchema, type CreateCampaignInput } from '@campaign/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

// EmailTokenizer: comma or Enter converts typed text to chip token.
// Inline component — not extracted to separate file (UI-SPEC: can be inline or extracted).
function EmailTokenizer({
  value,
  onChange,
}: {
  value: string[];
  onChange: (emails: string[]) => void;
}): React.ReactElement {
  const [inputValue, setInputValue] = useState('');

  const addEmail = (raw: string) => {
    const emails = raw
      .split(/[,\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length > 0) {
      onChange([...value, ...emails]);
      setInputValue('');
    }
  };

  return (
    <div className="flex flex-wrap gap-1 rounded-md border p-2 min-h-[2.5rem]">
      {value.map((email) => (
        <span
          key={email}
          className="flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-sm"
        >
          {email}
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground leading-none"
            onClick={() => onChange(value.filter((e) => e !== email))}
            aria-label={`Remove ${email}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addEmail(inputValue);
          }
        }}
        onBlur={() => {
          if (inputValue) addEmail(inputValue);
        }}
        placeholder={value.length === 0 ? 'Add email addresses...' : ''}
        className="flex-1 outline-none bg-transparent text-sm min-w-[8rem]"
      />
    </div>
  );
}

export function NewCampaignPage(): React.ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateCampaignInput>({
    resolver: zodResolver(CreateCampaignSchema),
    defaultValues: { name: '', subject: '', body: '', recipientEmails: [] },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateCampaignInput) =>
      api.post<{ data: { id: string } }>('/campaigns', data),
    onSuccess: async (res) => {
      // Invalidate list cache — new campaign should appear on next list fetch.
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      navigate(`/campaigns/${res.data.data.id}`);
    },
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold mb-6">New Campaign</h1>
      <form
        onSubmit={handleSubmit((data) => createMutation.mutate(data))}
        className="space-y-4"
      >
        <div className="space-y-1">
          <Label htmlFor="name">Campaign Name</Label>
          <Input id="name" {...register('name')} placeholder="My campaign" />
          {errors.name && (
            <p className="text-destructive text-sm">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="subject">Email Subject</Label>
          <Input
            id="subject"
            {...register('subject')}
            placeholder="Hello from Campaign Manager"
          />
          {errors.subject && (
            <p className="text-destructive text-sm">{errors.subject.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="body">Email Body</Label>
          <Textarea
            id="body"
            rows={6}
            {...register('body')}
            placeholder="Write your email content here..."
          />
          {errors.body && (
            <p className="text-destructive text-sm">{errors.body.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label>Recipients</Label>
          <Controller
            name="recipientEmails"
            control={control}
            render={({ field }) => (
              <EmailTokenizer value={field.value} onChange={field.onChange} />
            )}
          />
          {errors.recipientEmails && (
            <p className="text-destructive text-sm">
              {errors.recipientEmails.message ?? 'At least one valid email is required'}
            </p>
          )}
        </div>

        {createMutation.isError && (
          <p className="text-destructive text-sm">
            {createMutation.error instanceof Error
              ? createMutation.error.message
              : 'Failed to create campaign'}
          </p>
        )}

        <Button
          type="submit"
          variant="default"
          className="w-full"
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? 'Creating...' : 'Create Campaign'}
        </Button>
      </form>
    </div>
  );
}
