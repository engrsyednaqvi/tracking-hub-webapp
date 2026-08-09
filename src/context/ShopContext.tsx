import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEMO_SHOPS, type Shop } from '@/types/shop';

type ShopFilter = 'all' | string;

interface ShopContextValue {
  shops: Shop[];
  activeShopId: ShopFilter;
  setActiveShopId: (id: ShopFilter) => void;
  activeShop: Shop | null;
}

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const [shops] = useState<Shop[]>(DEMO_SHOPS);
  const [activeShopId, setActiveShopId] = useState<ShopFilter>('all');

  const value = useMemo<ShopContextValue>(
    () => ({
      shops,
      activeShopId,
      setActiveShopId,
      activeShop: shops.find((s) => s.id === activeShopId) ?? null,
    }),
    [shops, activeShopId],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShops() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShops must be used within ShopProvider');
  return ctx;
}
