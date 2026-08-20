import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DEMO_ORDERS, DEMO_SHOPS, DEMO_SUPPLIERS, type Order, type Shop, type Supplier } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useAppErrors } from '@/context/ErrorContext';
import { syncEtsyOrders } from '@/lib/functions';
import { subscribeOrders } from '@/services/orders';
import { subscribeShops } from '@/services/shops';
import { createSupplier, subscribeSuppliers } from '@/services/suppliers';

type ShopFilter = 'all' | string;

const AUTO_SYNC_MS = 30 * 60 * 1000;

interface ShopContextValue {
  shops: Shop[];
  orders: Order[];
  suppliers: Supplier[];
  activeShopId: ShopFilter;
  setActiveShopId: (id: ShopFilter) => void;
  activeShop: Shop | null;
  filteredOrders: Order[];
  loading: boolean;
  error: string | null;
  syncing: boolean;
  syncMessage: string | null;
  /** Most relevant shop lastSyncAt for the current filter (active shop, or latest across connected). */
  lastSyncedAt: string | null;
  syncAll: () => Promise<void>;
  syncShop: (shopId: string) => Promise<void>;
  addSupplier: (name: string) => Promise<Supplier>;
}

function resolveLastSyncedAt(shops: Shop[], activeShopId: ShopFilter): string | null {
  if (activeShopId !== 'all') {
    const shop = shops.find((s) => s.id === activeShopId);
    return shop?.lastSyncAt ?? null;
  }

  const candidates = shops.filter((s) => s.connected && !s.reconnectRequired);
  const pool = candidates.length ? candidates : shops;
  let latest: string | null = null;
  let latestMs = -1;
  for (const shop of pool) {
    if (!shop.lastSyncAt) continue;
    const ms = new Date(shop.lastSyncAt).getTime();
    if (Number.isNaN(ms) || ms <= latestMs) continue;
    latestMs = ms;
    latest = shop.lastSyncAt;
  }
  return latest;
}

const ShopContext = createContext<ShopContextValue | null>(null);

function formatSyncBanner(result: Awaited<ReturnType<typeof syncEtsyOrders>>): string {
  const uspsBit =
    typeof result.uspsEnriched === 'number' ? ` · USPS enriched ${result.uspsEnriched}` : '';
  const uspsErr = result.uspsError ? ` · USPS: ${result.uspsError}` : '';
  const shopErrBit = result.shopErrors?.length
    ? ` · Shop errors: ${result.shopErrors.length}`
    : '';
  return `Synced ${result.shops} shop(s): ${result.created} new, ${result.updated} updated (last ${result.syncDays} days)${uspsBit}${uspsErr}${shopErrBit}.`;
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const { user, demoMode } = useAuth();
  const { reportError, reportInfo } = useAppErrors();
  const [shops, setShops] = useState<Shop[]>(demoMode ? DEMO_SHOPS : []);
  const [orders, setOrders] = useState<Order[]>(demoMode ? DEMO_ORDERS : []);
  const [suppliers, setSuppliers] = useState<Supplier[]>(demoMode ? DEMO_SUPPLIERS : []);
  const [activeShopId, setActiveShopId] = useState<ShopFilter>('all');
  const [loading, setLoading] = useState(!demoMode);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (demoMode) {
      setShops(DEMO_SHOPS);
      setOrders(DEMO_ORDERS);
      setSuppliers(DEMO_SUPPLIERS);
      setLoading(false);
      setError(null);
      return;
    }
    if (!user) {
      setShops([]);
      setOrders([]);
      setSuppliers([]);
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
    const unsubSuppliers = subscribeSuppliers(
      user.uid,
      (next) => setSuppliers(next),
      (err) => setError(err.message),
    );

    return () => {
      unsubShops();
      unsubOrders();
      unsubSuppliers();
    };
  }, [user, demoMode]);

  useEffect(() => {
    if (activeShopId !== 'all' && !shops.some((s) => s.id === activeShopId)) {
      setActiveShopId('all');
    }
  }, [shops, activeShopId]);

  const runSync = useCallback(
    async (shopId?: string, opts?: { silent?: boolean }) => {
      if (demoMode || !user) return;
      if (syncingRef.current) return;
      const syncable = shops.filter((s) => s.connected && !s.reconnectRequired);
      if (!syncable.length) {
        const msg =
          'No shops ready to sync. On Shops, connect each shop with its Seller app keys first.';
        setSyncMessage(msg);
        if (!opts?.silent) reportInfo('Sync skipped', msg);
        return;
      }

      syncingRef.current = true;
      setSyncing(true);

      try {
        const result = await syncEtsyOrders({ shopId, syncDays: 30 });
        const banner = formatSyncBanner(result);
        setSyncMessage(banner);
        reportInfo(opts?.silent ? 'Auto-sync' : 'Sync complete', banner);
        if (result.shopErrors?.length) {
          reportError('Sync shop errors', result.shopErrors.join('\n'));
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setSyncMessage(detail);
        reportError(opts?.silent ? 'Auto-sync failed' : 'Etsy sync failed', err);
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    [demoMode, user, shops, reportError, reportInfo],
  );

  const syncAll = useCallback(() => runSync(), [runSync]);
  const syncShop = useCallback((shopId: string) => runSync(shopId), [runSync]);

  const addSupplier = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Supplier name is required');
      if (demoMode) {
        const now = new Date().toISOString();
        const supplier: Supplier = {
          id: `supplier-demo-${Date.now()}`,
          name: trimmed,
          createdAt: now,
          updatedAt: now,
        };
        setSuppliers((prev) => [...prev, supplier]);
        return supplier;
      }
      if (!user) throw new Error('Sign in to add suppliers.');
      return createSupplier(user.uid, { name: trimmed });
    },
    [demoMode, user],
  );

  // Free client-side auto-sync while the app tab is open (~48 calls/day).
  useEffect(() => {
    if (demoMode || !user) return;
    if (!shops.some((s) => s.connected && !s.reconnectRequired)) return;

    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void runSync(undefined, { silent: true });
    }, AUTO_SYNC_MS);

    return () => window.clearInterval(id);
  }, [demoMode, user, shops, runSync]);

  const value = useMemo<ShopContextValue>(() => {
    const filteredOrders =
      activeShopId === 'all' ? orders : orders.filter((o) => o.shopId === activeShopId);

    return {
      shops,
      orders,
      suppliers,
      activeShopId,
      setActiveShopId,
      activeShop: shops.find((s) => s.id === activeShopId) ?? null,
      filteredOrders,
      loading,
      error,
      syncing,
      syncMessage,
      lastSyncedAt: resolveLastSyncedAt(shops, activeShopId),
      syncAll,
      syncShop,
      addSupplier,
    };
  }, [
    shops,
    orders,
    suppliers,
    activeShopId,
    loading,
    error,
    syncing,
    syncMessage,
    syncAll,
    syncShop,
    addSupplier,
  ]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShops() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShops must be used within ShopProvider');
  return ctx;
}
