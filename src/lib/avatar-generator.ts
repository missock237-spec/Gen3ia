/**
 * Avatar Generator — Génère des avatars AI pour les agents
 * Utilise des APIs gratuites (DiceBear, UI Avatars) avec fallback
 */

import crypto from 'crypto';

export type AvatarStyle = 'bottts' | 'adventurer' | 'avataaars' | 'fun-emoji' | 'identicon' | 'lorelei' | 'notionists' | 'thumbs';

export interface AvatarOptions {
  style?: AvatarStyle;
  seed?: string;
  backgroundColor?: string;
  width?: number;
  height?: number;
}

const STYLES: AvatarStyle[] = ['bottts', 'adventurer', 'avataaars', 'fun-emoji', 'lorelei', 'notionists'];
const COLORS = ['4f46e5', '7c3aed', '2563eb', '059669', 'd97706', 'dc2626', '6b7280', '0891b2'];

function getSeed(name: string): string {
  return crypto.createHash('md5').update(name).digest('hex').substring(0, 8);
}

/**
 * Génère une URL d'avatar pour un agent
 */
export function generateAgentAvatarUrl(
  name: string,
  options: AvatarOptions = {},
): string {
  const seed = options.seed || getSeed(name);
  const style = options.style || STYLES[parseInt(seed.substring(0, 2), 16) % STYLES.length];
  const color = options.backgroundColor || COLORS[parseInt(seed.substring(2, 4), 16) % COLORS.length];

  // DiceBear - générateur d'avatars gratuit (pas de clé API nécessaire)
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}&backgroundColor=${color}`;
}

/**
 * Génère un avatar de secours avec les initiales
 */
export function generateInitialsAvatar(
  name: string,
): string {
  const initials = name
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  const seed = getSeed(name);
  const color = COLORS[parseInt(seed.substring(0, 2), 16) % COLORS.length];

  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${color}&color=fff&size=256&bold=true`;
}

/**
 * Génère les métadonnées d'avatar complètes
 */
export function generateAvatarData(name: string): {
  avatarUrl: string;
  initialsUrl: string;
  style: AvatarStyle;
  color: string;
} {
  const seed = getSeed(name);
  const style = STYLES[parseInt(seed.substring(0, 2), 16) % STYLES.length];
  const color = COLORS[parseInt(seed.substring(2, 4), 16) % COLORS.length];

  return {
    avatarUrl: `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}&backgroundColor=${color}`,
    initialsUrl: generateInitialsAvatar(name),
    style,
    color,
  };
}

// Styles disponibles avec description
export const AVATAR_STYLES_INFO: { id: AvatarStyle; name: string; description: string }[] = [
  { id: 'bottts', name: 'Robots', description: 'Avatars robotiques' },
  { id: 'adventurer', name: 'Aventurier', description: 'Style aventure' },
  { id: 'avataaars', name: 'Avatars', description: 'Avatars réalistes' },
  { id: 'fun-emoji', name: 'Emoji', description: 'Emojis colorés' },
  { id: 'lorelei', name: 'Lorelei', description: 'Illustrations douces' },
  { id: 'notionists', name: 'Notion', description: 'Style Notion moderne' },
];
