import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { CopyButton } from '../components/CopyButton';
import { Navbar } from '../components/Navbar';

describe('Friday Fun 2026 - Accessible UI Components', () => {
  it('renders Badge with custom variants and text', () => {
    render(<Badge variant="success">Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders PlayerAvatar with avatar initials/emoji and player code badge', () => {
    render(<PlayerAvatar displayName="Arun" playerCode="A" size="md" />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders WhatsAppButton with touch-friendly min height and valid link', () => {
    render(<WhatsAppButton url="https://wa.me/?text=Hello" label="Share on WhatsApp" />);
    const button = screen.getByRole('link', { name: /share on whatsapp/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('href', 'https://wa.me/?text=Hello');
    expect(button).toHaveClass('min-h-[44px]');
  });

  it('renders CopyButton with copy feedback', async () => {
    render(<CopyButton textToCopy="https://friday-fun.vercel.app" label="Copy Link" copiedLabel="Copied!" />);
    const btn = screen.getByRole('button', { name: /copy link/i });
    expect(btn).toBeInTheDocument();
  });

  it('renders Navbar with game branding and mobile menu toggle', () => {
    render(
      <BrowserRouter>
        <Navbar />
      </BrowserRouter>
    );
    expect(screen.getByText('FRIDAY FUN')).toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();

    const mobileMenuBtn = screen.getByLabelText(/toggle navigation menu/i);
    expect(mobileMenuBtn).toBeInTheDocument();

    // Click to open mobile menu
    fireEvent.click(mobileMenuBtn);
    expect(screen.getByText('Game Overview')).toBeInTheDocument();
  });
});
