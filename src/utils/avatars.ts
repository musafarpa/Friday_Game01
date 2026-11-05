export interface AvatarPreset {
  id: string;
  name: string;
  gradient: string;
  emoji: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: '1', name: 'Cosmic Fox', gradient: 'from-purple-600 to-indigo-600', emoji: '🦊' },
  { id: '2', name: 'Cyber Tiger', gradient: 'from-blue-600 to-cyan-500', emoji: '🐯' },
  { id: '3', name: 'Neon Panda', gradient: 'from-emerald-500 to-teal-700', emoji: '🐼' },
  { id: '4', name: 'Rocket Falcon', gradient: 'from-amber-500 to-rose-500', emoji: '🦅' },
  { id: '5', name: 'Pixel Dragon', gradient: 'from-fuchsia-600 to-pink-500', emoji: '🐉' },
  { id: '6', name: 'Electro Wolf', gradient: 'from-indigo-600 to-blue-500', emoji: '🐺' },
  { id: '7', name: 'Astro Bear', gradient: 'from-cyan-600 to-blue-700', emoji: '🐻' },
  { id: '8', name: 'Golden Lion', gradient: 'from-yellow-500 to-orange-600', emoji: '🦁' },
];

export function getAvatarForPlayer(codeOrName: string): AvatarPreset {
  let hash = 0;
  for (let i = 0; i < codeOrName.length; i++) {
    hash = codeOrName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PRESETS.length;
  return AVATAR_PRESETS[index];
}

