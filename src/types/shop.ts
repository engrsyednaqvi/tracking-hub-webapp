export type ShopPlatform = 'etsy';

export interface Shop {
  id: string;
  name: string;
  platform: ShopPlatform;
  /** True once Etsy OAuth tokens are stored (server-side). */
  connected: boolean;
  /** Set when tokens no longer match the server Etsy app (must Connect again). */
  reconnectRequired?: boolean;
  reconnectReason?: string;
  etsyShopId?: string | null;
  etsyUserId?: string | null;
  lastSyncAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const DEMO_SHOPS: Shop[] = [
  {
    id: 'shop-a',
    name: 'Shop A',
    platform: 'etsy',
    connected: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'shop-b',
    name: 'Shop B',
    platform: 'etsy',
    connected: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
