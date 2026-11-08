/**
 * Sharing and WhatsApp URL helpers for Friday Fun 2026
 *
 * Links are built from VITE_PUBLIC_BASE_URL when set (recommended for production so links never
 * depend on which address the admin happened to open), otherwise from the current origin.
 */

function envBaseUrl(): string {
  try {
    const v = (import.meta as any).env?.VITE_PUBLIC_BASE_URL as string | undefined;
    return v ? v.replace(/\/+$/, '') : '';
  } catch {
    return '';
  }
}

export function getBaseUrl(): string {
  const configured = envBaseUrl();
  if (configured) return configured;
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return 'https://friday-fun-2026.vercel.app';
}

export function buildInvitationUrl(gameId: string, token: string): string {
  return `${getBaseUrl()}/join/${gameId}/${token}`;
}

export function buildChallengeUrl(challengeToken: string): string {
  return `${getBaseUrl()}/challenge/${challengeToken}`;
}

export function buildLeaderboardUrl(gameId: string): string {
  return `${getBaseUrl()}/leaderboard/${gameId}`;
}

export function generateInvitationWhatsAppUrl(participantName: string, inviteUrl: string): string {
  const message = `Hello ${participantName}! Welcome to Friday Fun 2026! 🎉

Your personal game invitation is ready.

Open this link to join:
${inviteUrl}

Get ready for some fun! 🚀`;

  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function generateChallengeWhatsAppUrl(receiverName: string, challengeUrl: string): string {
  const message = `Hey ${receiverName}! 😂

You have received a Friday Fun challenge!

Open your personal question here:
${challengeUrl}

Good luck! 🔥`;

  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older devices / unsecured contexts
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    }
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}
