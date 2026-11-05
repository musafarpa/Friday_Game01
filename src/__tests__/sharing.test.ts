import { describe, it, expect } from 'vitest';
import {
  buildInvitationUrl,
  buildChallengeUrl,
  generateInvitationWhatsAppUrl,
  generateChallengeWhatsAppUrl,
} from '../utils/sharing';

describe('Friday Fun 2026 - Sharing & WhatsApp Integrations', () => {
  it('should construct valid invitation URLs', () => {
    const url = buildInvitationUrl('game-123', 'token-abc');
    expect(url).toContain('/join/game-123/token-abc');
  });

  it('should construct valid challenge URLs', () => {
    const url = buildChallengeUrl('challenge-xyz-789');
    expect(url).toContain('/challenge/challenge-xyz-789');
  });

  it('should format WhatsApp invitation links with proper encoding and text', () => {
    const inviteUrl = 'https://friday-fun.vercel.app/join/game-1/token-1';
    const waUrl = generateInvitationWhatsAppUrl('Arun', inviteUrl);

    expect(waUrl.startsWith('https://wa.me/?text=')).toBe(true);
    const decoded = decodeURIComponent(waUrl.split('text=')[1]);
    expect(decoded).toContain('Hello Arun! Welcome to Friday Fun 2026!');
    expect(decoded).toContain(inviteUrl);
    expect(decoded).toContain('Get ready for some fun!');
  });

  it('should format WhatsApp challenge links with proper encoding and challenge URL', () => {
    const challengeUrl = 'https://friday-fun.vercel.app/challenge/token-999';
    const waUrl = generateChallengeWhatsAppUrl('Amal', challengeUrl);

    expect(waUrl.startsWith('https://wa.me/?text=')).toBe(true);
    const decoded = decodeURIComponent(waUrl.split('text=')[1]);
    expect(decoded).toContain('Hey Amal! 😂');
    expect(decoded).toContain('You have received a Friday Fun challenge!');
    expect(decoded).toContain(challengeUrl);
  });
});
