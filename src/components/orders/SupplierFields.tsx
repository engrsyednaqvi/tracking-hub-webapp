import { useEffect, useState, type ChangeEvent } from 'react';
import { ExternalLink } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useShops } from '@/context/ShopContext';
import { updateOrder } from '@/services/orders';
import { buildTrackingUrl } from '@/utils/trackingUrl';
import { cn } from '@/lib/cn';
import type { Order, Supplier } from '@/types';

const ADD_SUPPLIER_VALUE = '__add_supplier__';

export function SupplierSelect({
  order,
  className,
  disabled,
}: {
  order: Order;
  className?: string;
  disabled?: boolean;
}) {
  const { user, demoMode } = useAuth();
  const { suppliers, addSupplier } = useShops();
  const [busy, setBusy] = useState(false);

  const value =
    order.supplierId && suppliers.some((s) => s.id === order.supplierId)
      ? order.supplierId
      : order.supplierName
        ? `__name__:${order.supplierName}`
        : '';

  async function persistSupplier(supplier: Supplier | null) {
    if (demoMode || !user) return;
    setBusy(true);
    try {
      await updateOrder(user.uid, order.id, {
        supplierId: supplier?.id ?? '',
        supplierName: supplier?.name ?? '',
      });
    } finally {
      setBusy(false);
    }
  }

  async function onChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (next === ADD_SUPPLIER_VALUE) {
      e.target.value = value;
      const name = window.prompt('New supplier name (e.g. Temu, Amazon, Warehouse)');
      if (!name?.trim()) return;
      setBusy(true);
      try {
        const created = await addSupplier(name);
        if (!demoMode && user) {
          await updateOrder(user.uid, order.id, {
            supplierId: created.id,
            supplierName: created.name,
          });
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!next) {
      await persistSupplier(null);
      return;
    }
    if (next.startsWith('__name__:')) {
      return;
    }
    const supplier = suppliers.find((s) => s.id === next) ?? null;
    await persistSupplier(supplier);
  }

  const orphanName =
    order.supplierName &&
    !suppliers.some(
      (s) => s.id === order.supplierId || s.name.toLowerCase() === order.supplierName.toLowerCase(),
    )
      ? order.supplierName
      : null;

  return (
    <select
      value={value}
      disabled={disabled || busy || demoMode || !user}
      onChange={(e) => void onChange(e)}
      className={cn(
        'w-full min-w-[8.5rem] rounded-xl border border-surface-line bg-white px-2 py-1.5 text-sm text-slate-800 disabled:opacity-60',
        className,
      )}
      aria-label="Supplier"
    >
      <option value="">—</option>
      {orphanName ? <option value={`__name__:${orphanName}`}>{orphanName}</option> : null}
      {suppliers.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
      <option value={ADD_SUPPLIER_VALUE}>Add supplier…</option>
    </select>
  );
}

export function SupplierTrackingInput({
  order,
  className,
  disabled,
}: {
  order: Order;
  className?: string;
  disabled?: boolean;
}) {
  const { user, demoMode } = useAuth();
  const [draft, setDraft] = useState(order.supplierTrackingNumber ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(order.supplierTrackingNumber ?? '');
  }, [order.supplierTrackingNumber]);

  const trackUrl = buildTrackingUrl(draft || order.supplierTrackingNumber || '');

  async function save(next: string) {
    if (demoMode || !user) return;
    const trimmed = next.trim();
    if (trimmed === (order.supplierTrackingNumber ?? '').trim()) return;
    setBusy(true);
    try {
      await updateOrder(user.uid, order.id, { supplierTrackingNumber: trimmed });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn('flex min-w-[9rem] items-center gap-1.5', className)}>
      <input
        value={draft}
        disabled={disabled || busy || demoMode || !user}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        placeholder="Paste tracking"
        className="w-full rounded-xl border border-surface-line bg-white px-2 py-1.5 text-sm text-slate-800 disabled:opacity-60"
        aria-label="Supplier tracking"
      />
      {trackUrl ? (
        <a
          href={trackUrl}
          target="_blank"
          rel="noreferrer"
          title="Open tracking"
          className="shrink-0 rounded-lg p-1 text-brand hover:bg-brand/5"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </div>
  );
}

export function SupplierOrderNumberInput({
  order,
  className,
  disabled,
}: {
  order: Order;
  className?: string;
  disabled?: boolean;
}) {
  const { user, demoMode } = useAuth();
  const [draft, setDraft] = useState(order.supplierOrderNumber ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(order.supplierOrderNumber ?? '');
  }, [order.supplierOrderNumber]);

  async function save(next: string) {
    if (demoMode || !user) return;
    const trimmed = next.trim();
    if (trimmed === (order.supplierOrderNumber ?? '').trim()) return;
    setBusy(true);
    try {
      await updateOrder(user.uid, order.id, { supplierOrderNumber: trimmed });
    } finally {
      setBusy(false);
    }
  }

  return (
    <input
      value={draft}
      disabled={disabled || busy || demoMode || !user}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void save(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      placeholder="PO / order #"
      className={cn(
        'w-full rounded-xl border border-surface-line bg-white px-2 py-1.5 text-sm text-slate-800 disabled:opacity-60',
        className,
      )}
      aria-label="Supplier order number"
    />
  );
}
