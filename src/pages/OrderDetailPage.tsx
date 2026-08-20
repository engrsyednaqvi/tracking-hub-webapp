import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Gift,
  MapPin,
  MessageSquare,
  Package,
  Truck,
} from 'lucide-react';
import {
  SupplierOrderNumberInput,
  SupplierSelect,
  SupplierTrackingInput,
} from '@/components/orders/SupplierFields';
import { useShops } from '@/context/ShopContext';
import { formatOrderDate, formatOrderDateTime } from '@/utils/date';
import { etsyOrderUrl } from '@/utils/etsyLinks';
import { statusHelp, statusLabel, statusTone } from '@/utils/status';
import { buildTrackingUrl } from '@/utils/trackingUrl';
import { cn } from '@/lib/cn';
import type { EtsyLineItem, EtsyMoney, EtsyVariation, Order } from '@/types';

function money(m?: EtsyMoney | null): string {
  return m?.formatted || '—';
}

function addressLines(order: Order): string[] {
  const e = order.etsy;
  if (!e) return [];
  if (e.formattedAddress) return e.formattedAddress.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return [
    e.name,
    e.firstLine,
    e.secondLine,
    [e.city, e.state, e.zip].filter(Boolean).join(', '),
    e.countryIso,
  ].filter(Boolean);
}

function VariationList({ items }: { items: EtsyVariation[] }) {
  if (!items.length) return null;
  return (
    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
      {items.map((v, i) => (
        <div
          key={`${v.formattedName}-${v.formattedValue}-${i}`}
          className="rounded-xl bg-slate-50 px-3 py-2"
        >
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {v.formattedName}
          </dt>
          <dd className="mt-0.5 text-sm font-medium text-slate-900">{v.formattedValue}</dd>
        </div>
      ))}
    </dl>
  );
}

function LineItemCard({ item }: { item: EtsyLineItem }) {
  const variations = item.variations.length ? item.variations : item.productData;
  return (
    <article className="overflow-hidden rounded-2xl border border-surface-line bg-white shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="bg-slate-100">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.title || 'Listing'}
              className="aspect-square w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex aspect-square items-center justify-center text-slate-400">
              <Package className="h-12 w-12" />
            </div>
          )}
        </div>
        <div className="space-y-4 p-5">
          <div>
            <h3 className="text-lg font-semibold leading-snug text-slate-900">
              {item.title || 'Listing'}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Qty {item.quantity}
              {item.sku ? ` · SKU ${item.sku}` : ''}
              {item.isDigital ? ' · Digital' : ''}
            </p>
          </div>

          <VariationList items={variations} />

          {item.description ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Description
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {item.description}
              </p>
            </div>
          ) : null}

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <Detail label="Item price" value={money(item.price)} />
            <Detail label="Shipping (line)" value={money(item.shippingCost)} />
            <Detail label="Paid" value={formatOrderDateTime(item.paidAt)} />
            <Detail label="Ship by" value={formatOrderDateTime(item.expectedShipDate)} />
            <Detail label="Shipped" value={formatOrderDateTime(item.shippedAt)} />
            <Detail
              label="Processing days"
              value={
                item.minProcessingDays != null || item.maxProcessingDays != null
                  ? `${item.minProcessingDays ?? '?'}–${item.maxProcessingDays ?? '?'}`
                  : '—'
              }
            />
            <Detail label="Shipping method" value={item.shippingMethod || '—'} />
            <Detail label="Shipping upgrade" value={item.shippingUpgrade || '—'} />
            <Detail label="Listing ID" value={item.listingId != null ? String(item.listingId) : '—'} />
            <Detail
              label="Transaction ID"
              value={item.transactionId || '—'}
            />
            <Detail
              label="Product ID"
              value={item.productId != null ? String(item.productId) : '—'}
            />
            <Detail
              label="Coupons"
              value={
                item.buyerCoupon != null || item.shopCoupon != null
                  ? `Buyer ${item.buyerCoupon ?? 0} · Shop ${item.shopCoupon ?? 0}`
                  : '—'
              }
            />
          </dl>

          {item.fileData ? (
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">Files: </span>
              {item.fileData}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-surface-line/80 px-3 py-2">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-surface-line bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function OrderDetailPage() {
  const { orderId } = useParams();
  const { orders, shops, loading } = useShops();
  const order = orders.find((o) => o.id === orderId);
  const shop = order ? shops.find((s) => s.id === order.shopId) : null;
  const etsy = order?.etsy;
  const etsyUrl = etsyOrderUrl(order?.etsyReceiptId || order?.etsyOrderNumber);
  const trackUrl = order
    ? buildTrackingUrl(order.trackingNumber, order.carrier)
    : null;
  const heroImage =
    order?.imageUrl ||
    etsy?.lineItems?.find((li) => li.imageUrl)?.imageUrl ||
    '';

  if (loading) {
    return <p className="text-sm text-slate-500">Loading order…</p>;
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-brand hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to orders
        </Link>
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
          <p className="text-sm font-medium text-slate-800">Order not found</p>
          <p className="mt-2 text-sm text-slate-500">It may have been deleted or not synced yet.</p>
        </div>
      </div>
    );
  }

  const addr = addressLines(order);
  const lineItems = etsy?.lineItems?.length
    ? etsy.lineItems
    : [
        {
          transactionId: '',
          title: order.product,
          description: '',
          quantity: 1,
          listingId: null,
          productId: null,
          sku: '',
          isDigital: false,
          fileData: '',
          price: null,
          shippingCost: null,
          variations: [],
          productData: [],
          shippedAt: order.dispatchedAt ?? null,
          paidAt: null,
          createdAt: order.createdAt,
          expectedShipDate: order.shipByAt ?? null,
          shippingMethod: '',
          shippingUpgrade: '',
          shippingProfileId: '',
          minProcessingDays: null,
          maxProcessingDays: null,
          buyerCoupon: null,
          shopCoupon: null,
          listingImageId: null,
          imageUrl: order.imageUrl || '',
        } satisfies EtsyLineItem,
      ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-brand hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to orders
        </Link>
        {etsyUrl ? (
          <a
            href={etsyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-brand"
          >
            Open on Etsy
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>

      <header className="overflow-hidden rounded-2xl border border-surface-line bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,26rem)_1fr]">
          <div className="bg-slate-100">
            {heroImage ? (
              <img
                src={heroImage}
                alt=""
                className="aspect-square w-full object-cover lg:min-h-[22rem]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex aspect-square min-h-[16rem] items-center justify-center text-slate-400">
                <Package className="h-16 w-16" />
              </div>
            )}
          </div>
          <div className="flex flex-col justify-between gap-6 p-6">
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Customer
                </p>
                <h1 className="text-2xl font-semibold leading-tight text-slate-900 sm:text-3xl">
                  {etsy?.name || order.customerName || 'Customer'}
                </h1>
                {etsy?.buyerEmail ? (
                  <p className="text-sm text-slate-600">
                    <a
                      href={`mailto:${etsy.buyerEmail}`}
                      className="text-brand hover:underline"
                    >
                      {etsy.buyerEmail}
                    </a>
                  </p>
                ) : null}
                {addr.length ? (
                  <div className="flex gap-2 pt-1 text-sm leading-relaxed text-slate-700">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div className="space-y-0.5">
                      {addr.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 border-t border-surface-line pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {shop?.name || 'Shop'} · Order #{order.etsyOrderNumber || '—'}
                </p>
                <p className="text-base font-medium leading-snug text-slate-900 sm:text-lg">
                  {lineItems[0]?.title || order.product || 'Order'}
                </p>
                <p className="text-sm text-slate-600">
                  Placed {formatOrderDateTime(order.createdAt)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    title={statusHelp(order.status)}
                    className={cn(
                      'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
                      statusTone(order.status),
                    )}
                  >
                    {statusLabel(order.status)}
                  </span>
                  {etsy?.status ? (
                    <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                      Etsy: {etsy.status}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <dl className="grid gap-2 sm:grid-cols-2">
              <Detail label="Grand total" value={money(etsy?.grandtotal)} />
              <Detail label="Payment" value={etsy?.paymentMethod || '—'} />
              <Detail
                label="Ship by"
                value={formatOrderDate(order.shipByAt || lineItems[0]?.expectedShipDate)}
              />
              <Detail
                label="Dispatched"
                value={formatOrderDate(order.dispatchedAt || lineItems[0]?.shippedAt)}
              />
            </dl>
          </div>
        </div>
      </header>

      {!etsy ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Full Etsy details aren’t on this order yet. Click <strong>Sync orders</strong> once to
          pull complete receipt data (title, size/variations, address, totals, messages).
        </div>
      ) : null}

      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Line items
        </h2>
        {lineItems.map((item, idx) => (
          <LineItemCard key={item.transactionId || `line-${idx}`} item={item} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Customer extras" icon={<MapPin className="h-4 w-4" />}>
          <dl className="grid gap-2 text-sm">
            <Detail label="Buyer user ID" value={etsy?.buyerUserId || '—'} />
            <Detail label="Country" value={etsy?.countryIso || '—'} />
          </dl>
        </Section>

        <Section title="Payment & totals" icon={<Package className="h-4 w-4" />}>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <Detail label="Subtotal" value={money(etsy?.subtotal)} />
            <Detail label="Total price" value={money(etsy?.totalPrice)} />
            <Detail label="Shipping" value={money(etsy?.totalShippingCost)} />
            <Detail label="Tax" value={money(etsy?.totalTaxCost)} />
            <Detail label="VAT" value={money(etsy?.totalVatCost)} />
            <Detail label="Discount" value={money(etsy?.discountAmt)} />
            <Detail label="Gift wrap" value={money(etsy?.giftWrapPrice)} />
            <Detail label="Grand total" value={money(etsy?.grandtotal)} />
            <Detail label="Payment method" value={etsy?.paymentMethod || '—'} />
            <Detail label="Payment email" value={etsy?.paymentEmail || '—'} />
            <Detail label="Paid" value={etsy?.isPaid ? 'Yes' : etsy ? 'No' : '—'} />
            <Detail label="Receipt type" value={etsy?.receiptType || '—'} />
          </dl>
        </Section>

        <Section title="Tracking & shipments" icon={<Truck className="h-4 w-4" />}>
          <dl className="grid gap-2 text-sm">
            <Detail label="Carrier" value={order.carrier || '—'} />
            <div className="rounded-xl border border-surface-line/80 px-3 py-2">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Tracking
              </dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {trackUrl ? (
                  <a
                    href={trackUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-brand hover:underline"
                  >
                    {order.trackingNumber}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  order.trackingNumber || '—'
                )}
              </dd>
            </div>
            {(etsy?.shipments ?? []).map((s, i) => (
              <div
                key={`${s.receiptShippingId}-${i}`}
                className="rounded-xl border border-surface-line/80 px-3 py-2 text-sm"
              >
                <p className="font-medium text-slate-900">
                  {s.carrierName || 'Shipment'} · {s.trackingCode || 'No tracking'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Notified {formatOrderDateTime(s.notificationAt)} · Mailed{' '}
                  {formatOrderDateTime(s.mailingDate)}
                </p>
              </div>
            ))}
            {!etsy?.shipments?.length ? (
              <p className="text-sm text-slate-500">No shipment records on the receipt yet.</p>
            ) : null}
          </dl>
        </Section>

        <Section title="Messages & gift" icon={<MessageSquare className="h-4 w-4" />}>
          <dl className="grid gap-2 text-sm">
            <Detail label="From buyer" value={etsy?.messageFromBuyer || '—'} />
            <Detail label="From seller" value={etsy?.messageFromSeller || '—'} />
            <Detail label="From payment" value={etsy?.messageFromPayment || '—'} />
            <Detail
              label="Gift"
              value={
                etsy?.isGift
                  ? `Yes${etsy.giftSender ? ` · from ${etsy.giftSender}` : ''}`
                  : etsy
                    ? 'No'
                    : '—'
              }
            />
            {etsy?.giftMessage ? (
              <div className="rounded-xl border border-surface-line/80 px-3 py-2 sm:col-span-2">
                <dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  <Gift className="h-3.5 w-3.5" />
                  Gift message
                </dt>
                <dd className="mt-1 whitespace-pre-wrap font-medium text-slate-900">
                  {etsy.giftMessage}
                </dd>
              </div>
            ) : null}
          </dl>
        </Section>
      </div>

      {etsy?.refunds?.length ? (
        <Section title="Refunds">
          <pre className="overflow-x-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
            {JSON.stringify(etsy.refunds, null, 2)}
          </pre>
        </Section>
      ) : null}

      <Section title="Supplier">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Supplier
            </span>
            <div className="mt-1">
              <SupplierSelect order={order} />
            </div>
          </label>
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Supplier order #
            </span>
            <div className="mt-1">
              <SupplierOrderNumberInput order={order} />
            </div>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Supplier tracking
            </span>
            <div className="mt-1 max-w-md">
              <SupplierTrackingInput order={order} />
            </div>
          </label>
          <Detail label="Etsy status raw" value={order.etsyStatusRaw || '—'} />
          <Detail label="Updated" value={formatOrderDateTime(order.updatedAt)} />
        </div>
      </Section>

      {etsy?.raw && Object.keys(etsy.raw).length ? (
        <details className="rounded-2xl border border-surface-line bg-white p-5 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">
            Full Etsy Open API receipt JSON
          </summary>
          <pre className="mt-4 max-h-[32rem] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-emerald-100">
            {JSON.stringify(etsy.raw, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
