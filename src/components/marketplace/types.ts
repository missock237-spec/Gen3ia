// ============================================================
// Types du Marketplace — Boucles IA, Competences, Personnalisations
// ============================================================

export type MarketplaceTab = 'loops' | 'skills' | 'customizations' | 'installed' | 'creator';
export type ItemType = 'skill' | 'loop' | 'customization';
export type SkillCategory = 'reasoning' | 'code' | 'research' | 'writing' | 'analysis' | 'creative' | 'automation' | 'communication' | 'data' | 'custom';
export type ItemStatus = 'draft' | 'published' | 'deprecated';

export interface MarketplaceItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  version: string;
  authorId: string;
  authorName?: string;
  price: number;
  isFree: boolean;
  isOfficial: boolean;
  tags: string[];
  installCount: number;
  rating: number;
  reviewCount: number;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
  type: ItemType;
  // Type-specific
  category?: SkillCategory;
  level?: string;
  compatibleModels?: string[];
  config?: any;
}

export interface InstalledItem {
  id: string;
  itemId: string;
  name: string;
  icon: string;
  type: ItemType;
  enabled: boolean;
  config: any;
  createdAt: string;
}

export interface CreatorForm {
  type: ItemType;
  name: string;
  slug: string;
  description: string;
  icon: string;
  price: number;
  category: SkillCategory;
  tags: string;
  level: string;
  compatibleModels: string;
  config: string;
}
