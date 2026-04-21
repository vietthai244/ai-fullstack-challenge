// frontend/src/test/CampaignBadge.test.tsx
//
// Phase 9 TEST-05: CampaignBadge Vitest + @testing-library/react.
// Tests all 4 status variants for correct label text, color class, and spinner presence.
// CampaignBadge is a pure presentational component — no Redux/RQ Provider needed.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CampaignBadge } from '@/components/CampaignBadge';

describe('CampaignBadge', () => {
  it('renders draft badge with grey styling', () => {
    render(<CampaignBadge status="draft" />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Draft').closest('[data-slot="badge"]'))
      .toHaveClass('bg-gray-100');
  });

  it('renders scheduled badge with blue styling', () => {
    render(<CampaignBadge status="scheduled" />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Scheduled').closest('[data-slot="badge"]'))
      .toHaveClass('bg-blue-100');
  });

  it('renders sending badge with amber styling and spinner', () => {
    render(<CampaignBadge status="sending" />);
    expect(screen.getByText('Sending')).toBeInTheDocument();
    const badge = screen.getByText('Sending').closest('[data-slot="badge"]');
    expect(badge).toHaveClass('bg-amber-100');
    expect(badge?.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders sent badge with green styling', () => {
    render(<CampaignBadge status="sent" />);
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Sent').closest('[data-slot="badge"]'))
      .toHaveClass('bg-green-100');
  });
});
