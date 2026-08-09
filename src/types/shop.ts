/** Multi-shop model — ready for Firebase later. */
export interface Shop {
  id: string;
  name: string;
  platform: 'etsy';
  /** Placeholder until OAuth is wired. */
  connected: boolean;
}

export const DEMO_SHOPS: Shop[] = [
  { id: 'shop-a', name: 'Shop A', platform: 'etsy', connected: false },
  { id: 'shop-b', name: 'Shop B', platform: 'etsy', connected: false },
];
