import { useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useShops } from '@/context/ShopContext';
import { createOrder } from '@/services/orders';
import { ORDER_STATUSES, type OrderStatus } from '@/types';

export function AddOrderForm({ onDone }: { onDone?: () => void }) {
  const { user, demoMode } = useAuth();
  const { shops, activeShopId } = useShops();
  const defaultShop =
    activeShopId !== 'all' ? activeShopId : shops[0]?.id ?? '';
  const [shopId, setShopId] = useState(defaultShop);
  const [etsyOrderNumber, setEtsyOrderNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [product, setProduct] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const [status, setStatus] = useState<OrderStatus>('waiting');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (demoMode || !user) {
      setError('Connect Firebase and sign in to save orders.');
      return;
    }
    if (!shopId) {
      setError('Add a shop first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createOrder(user.uid, {
        shopId,
        etsyOrderNumber,
        customerName,
        product,
        trackingNumber,
        carrier,
        status,
      });
      setEtsyOrderNumber('');
      setCustomerName('');
      setProduct('');
      setTrackingNumber('');
      setCarrier('');
      setStatus('waiting');
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create order');
    } finally {
      setBusy(false);
    }
  }

  if (!shops.length) {
    return (
      <p className="text-sm text-slate-500">
        Add a shop under Shops before creating orders.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm sm:col-span-2">
        <span className="text-slate-600">Shop</span>
        <select
          value={shopId}
          onChange={(e) => setShopId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-surface-line px-3 py-2 text-sm"
        >
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Etsy order #</span>
        <input
          required
          value={etsyOrderNumber}
          onChange={(e) => setEtsyOrderNumber(e.target.value)}
          className="mt-1 w-full rounded-xl border border-surface-line px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Status</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus)}
          className="mt-1 w-full rounded-xl border border-surface-line px-3 py-2 text-sm"
        >
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Customer</span>
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="mt-1 w-full rounded-xl border border-surface-line px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Product</span>
        <input
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          className="mt-1 w-full rounded-xl border border-surface-line px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Tracking #</span>
        <input
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          className="mt-1 w-full rounded-xl border border-surface-line px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Carrier</span>
        <input
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          className="mt-1 w-full rounded-xl border border-surface-line px-3 py-2 text-sm"
        />
      </label>
      {error ? <p className="text-sm text-rose-600 sm:col-span-2">{error}</p> : null}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Add order'}
        </button>
      </div>
    </form>
  );
}
