import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEMO_ORDERS, DEMO_SHOPS, type Order, type Shop } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { subscribeOrders } from '@/services/orders';
import { subscribeShops } from '@/services/shops';

type ShopFilter = 'all' | string;

interface ShopContextValue {
  shops: Shop[];
  orders: Order[];
  activeShopId: ShopFilter;
  setActiveShopId: (id: ShopFilter) => void;
  activeShop: Shop | null;
  filteredOrders: Order[];
  loading: boolean;
  error: string | null;
}

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const { user, demoMode } = useAuth();
  const [shops, setShops] = useState<Shop[]>(demoMode ? DEMO_SHOPS : []);
  const [orders, setOrders] = useState<Order[]>(demoMode ? DEMO_ORDERS : []);
  const [activeShopId, setActiveShopId] = useState<ShopFilter>('all');
  const [loading, setLoading] = useState(!demoMode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demoMode) {
      setShops(DEMO_SHOPS);
      setOrders(DEMO_ORDERS);
      setLoading(false);
      setError(null);
      return;
    }
    if (!user) {
      setShops([]);
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    let shopsReady = false;
    let ordersReady = false;
    const maybeDone = () => {
      if (shopsReady && ordersReady) setLoading(false);
    };

    const unsubShops = subscribeShops(
      user.uid,
      (next) => {
        setShops(next);
        shopsReady = true;
        maybeDone();
      },
      (err) => {
        setError(err.message);
        shopsReady = true;
        maybeDone();
      },
    );
    const unsubOrders = subscribeOrders(
      user.uid,
      (next) => {
        setOrders(next);
        ordersReady = true;
        maybeDone();
      },
      (err) => {
        setError(err.message);
        ordersReady = true;
        maybeDone();
      },
    );

    return () => {
      unsubShops();
      unsubOrders();
    };
  }, [user, demoMode]);

  useEffect(() => {
    if (activeShopId !== 'all' && !shops.some((s) => s.id === activeShopId)) {
      setActiveShopId('all');
    }
  }, [shops, activeShopId]);

  const value = useMemo<ShopContextValue>(() => {
    const filteredOrders =
      activeShopId === 'all'
        ? orders
        : orders.filter((o) => o.shopId === activeShopId);

    return {
      shops,
      orders,
      activeShopId,
      setActiveShopId,
      activeShop: shops.find((s) => s.id === activeShopId) ?? null,
      filteredOrders,
      loading,
      error,
    };
  }, [shops, orders, activeShopId, loading, error]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShops() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShops must be used within ShopProvider');
  return ctx;
}
