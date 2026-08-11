const API_BASE = 'https://openapi.etsy.com/v3/application';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const AUTH_URL = 'https://www.etsy.com/oauth/connect';

export const ETSY_SCOPES = ['shops_r', 'transactions_r'] as const;

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export function buildAuthorizeUrl(params: {
  keystring: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.keystring);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', ETSY_SCOPES.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

/** Trim secrets — Secret Manager / piping often leaves trailing newlines that break Headers. */
function cleanCreds(creds: { keystring: string; sharedSecret: string }): {
  keystring: string;
  sharedSecret: string;
} {
  return {
    keystring: creds.keystring.trim(),
    sharedSecret: creds.sharedSecret.trim(),
  };
}

function etsyApiKeyHeader(creds: { keystring: string; sharedSecret: string }): string {
  const { keystring, sharedSecret } = cleanCreds(creds);
  return `${keystring}:${sharedSecret}`;
}

async function postToken(
  creds: { keystring: string; sharedSecret: string },
  body: Record<string, string>,
): Promise<TokenResponse> {
  // Etsy requires x-api-key as keystring:shared_secret on all API/token requests (enforced 2026).
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-api-key': etsyApiKeyHeader(creds),
    },
    body: new URLSearchParams(body).toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Etsy token request failed (${response.status}): ${text || response.statusText}`);
  }
  return (await response.json()) as TokenResponse;
}

export async function exchangeAuthorizationCode(params: {
  keystring: string;
  sharedSecret: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const { keystring, sharedSecret } = cleanCreds(params);
  return postToken(
    { keystring, sharedSecret },
    {
      grant_type: 'authorization_code',
      client_id: keystring,
      redirect_uri: params.redirectUri,
      code: params.code,
      code_verifier: params.codeVerifier,
    },
  );
}

export async function refreshAccessToken(params: {
  keystring: string;
  sharedSecret: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  const { keystring, sharedSecret } = cleanCreds(params);
  return postToken(
    { keystring, sharedSecret },
    {
      grant_type: 'refresh_token',
      client_id: keystring,
      refresh_token: params.refreshToken,
    },
  );
}

export function userIdFromAccessToken(accessToken: string): string {
  return accessToken.split('.')[0] ?? '';
}

async function etsyFetch<T>(
  creds: { keystring: string; sharedSecret: string; accessToken: string },
  path: string,
): Promise<T> {
  const clean = cleanCreds(creds);
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      'x-api-key': etsyApiKeyHeader(clean),
      Authorization: `Bearer ${creds.accessToken.trim()}`,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Etsy API ${path} failed (${response.status}): ${text || response.statusText}`);
  }
  return (await response.json()) as T;
}

function toShopId(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickShop(data: unknown): { shop_id?: unknown; shop_name?: string } | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const record = data as Record<string, unknown>;
  if (record.shop_id != null) return record as { shop_id?: unknown; shop_name?: string };
  const results = record.results;
  if (Array.isArray(results) && results[0] && typeof results[0] === 'object') {
    return results[0] as { shop_id?: unknown; shop_name?: string };
  }
  return undefined;
}

export async function fetchPrimaryShop(creds: {
  keystring: string;
  sharedSecret: string;
  accessToken: string;
  userId?: string;
}): Promise<{ shopId: number; shopName: string; userId?: string }> {
  const all = await fetchAllShopsForUser(creds);
  if (!all.length) {
    throw new Error('No Etsy shop found for this account.');
  }
  return all[0]!;
}

/** All shops owned by the connected Etsy user (deduped by shopId). */
export async function fetchAllShopsForUser(creds: {
  keystring: string;
  sharedSecret: string;
  accessToken: string;
  userId?: string;
}): Promise<Array<{ shopId: number; shopName: string; userId?: string }>> {
  const byId = new Map<number, { shopId: number; shopName: string; userId?: string }>();

  const add = (shopId: number | null, shopName: string, userId?: string) => {
    if (!shopId || byId.has(shopId)) return;
    byId.set(shopId, { shopId, shopName: shopName || `Shop ${shopId}`, userId });
  };

  let resolvedUserId = creds.userId;

  try {
    const me = await etsyFetch<{ user_id?: string | number; shop_id?: string | number | null }>(
      creds,
      '/users/me',
    );
    resolvedUserId = me.user_id != null ? String(me.user_id) : resolvedUserId;
    const primaryId = toShopId(me.shop_id);
    if (primaryId) {
      try {
        const shop = await etsyFetch<{ shop_name?: string }>(creds, `/shops/${primaryId}`);
        add(primaryId, shop.shop_name ?? `Shop ${primaryId}`, resolvedUserId);
      } catch {
        add(primaryId, `Shop ${primaryId}`, resolvedUserId);
      }
    }
  } catch {
    // fall through to /users/{id}/shops
  }

  const userIds = [resolvedUserId, creds.userId].filter(
    (v, i, arr): v is string => !!v && arr.indexOf(v) === i,
  );

  for (const userId of userIds) {
    try {
      const byOwner = await etsyFetch<{
        results?: Array<{ shop_id?: unknown; shop_name?: string }>;
        shop_id?: unknown;
        shop_name?: string;
        count?: number;
      }>(creds, `/users/${userId}/shops`);

      if (Array.isArray(byOwner.results)) {
        for (const row of byOwner.results) {
          add(toShopId(row.shop_id), row.shop_name ?? '', userId);
        }
      } else {
        const single = pickShop(byOwner);
        add(toShopId(single?.shop_id), single?.shop_name ?? '', userId);
      }
    } catch {
      // try next user id
    }
  }

  if (!byId.size) {
    throw new Error(
      'Could not resolve your Etsy shop. Try Connect again with your seller account.',
    );
  }

  return [...byId.values()];
}

export type EtsyShippingStatus =
  | 'no_tracking'
  | 'pre_transit'
  | 'in_transit'
  | 'delivered'
  | 'cancelled';

export interface EtsyReceipt {
  receipt_id?: string | number;
  name?: string;
  first_line?: string;
  second_line?: string;
  city?: string;
  state?: string;
  zip?: string;
  country_iso?: string;
  /** Etsy order status: paid | completed | open | payment processing | canceled | … */
  status?: string;
  created_timestamp?: number;
  create_timestamp?: number;
  is_shipped?: boolean | number | string;
  was_shipped?: boolean | number | string;
  is_delivered?: boolean | number | string;
  was_delivered?: boolean | number | string;
  is_canceled?: boolean | number | string;
  was_canceled?: boolean | number | string;
  /** Set while fetching via Etsy was_shipped / was_delivered filters. */
  _shippingBucket?: EtsyShippingStatus;
  transactions?: Array<Record<string, unknown>>;
  shipments?: Array<Record<string, unknown>>;
  refunds?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export type MappedMoney = {
  amount: number;
  divisor: number;
  currencyCode: string;
  formatted: string;
};

export type MappedVariation = {
  propertyId: number | null;
  valueId: number | null;
  formattedName: string;
  formattedValue: string;
};

export type MappedLineItem = {
  transactionId: string;
  title: string;
  description: string;
  quantity: number;
  listingId: number | null;
  productId: number | null;
  sku: string;
  isDigital: boolean;
  fileData: string;
  price: MappedMoney | null;
  shippingCost: MappedMoney | null;
  variations: MappedVariation[];
  productData: MappedVariation[];
  shippedAt: string | null;
  paidAt: string | null;
  createdAt: string | null;
  expectedShipDate: string | null;
  shippingMethod: string;
  shippingUpgrade: string;
  shippingProfileId: string;
  minProcessingDays: number | null;
  maxProcessingDays: number | null;
  buyerCoupon: number | null;
  shopCoupon: number | null;
  listingImageId: number | null;
  imageUrl: string;
};

export type MappedShipment = {
  receiptShippingId: string;
  trackingCode: string;
  carrierName: string;
  notificationAt: string | null;
  mailingDate: string | null;
};

/** Rich Etsy receipt snapshot stored on each order for the detail page. */
export type MappedEtsyDetails = {
  receiptId: string;
  receiptType: string;
  status: string;
  isPaid: boolean;
  isShipped: boolean;
  isDelivered: boolean;
  isCanceled: boolean;
  isGift: boolean;
  giftMessage: string;
  giftSender: string;
  sellerUserId: string;
  sellerEmail: string;
  buyerUserId: string;
  buyerEmail: string;
  paymentMethod: string;
  paymentEmail: string;
  messageFromBuyer: string;
  messageFromSeller: string;
  messageFromPayment: string;
  name: string;
  firstLine: string;
  secondLine: string;
  city: string;
  state: string;
  zip: string;
  countryIso: string;
  formattedAddress: string;
  createdAt: string | null;
  updatedAt: string | null;
  subtotal: MappedMoney | null;
  totalPrice: MappedMoney | null;
  totalShippingCost: MappedMoney | null;
  totalTaxCost: MappedMoney | null;
  totalVatCost: MappedMoney | null;
  discountAmt: MappedMoney | null;
  giftWrapPrice: MappedMoney | null;
  grandtotal: MappedMoney | null;
  lineItems: MappedLineItem[];
  shipments: MappedShipment[];
  refunds: Array<Record<string, unknown>>;
  /** Full receipt JSON from Open API (minus internal fields). */
  raw: Record<string, unknown>;
};

function unixToIso(value: unknown): string | null {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Etsy uses seconds; tolerate ms if ever returned.
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

function asString(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapMoney(value: unknown): MappedMoney | null {
  if (!value || typeof value !== 'object') return null;
  const m = value as Record<string, unknown>;
  const amount = Number(m.amount);
  const divisor = Number(m.divisor || 100);
  const currencyCode = asString(m.currency_code || m.currencyCode) || 'USD';
  if (!Number.isFinite(amount) || !Number.isFinite(divisor) || divisor <= 0) return null;
  const major = amount / divisor;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode.length === 3 ? currencyCode : 'USD',
  }).format(major);
  return { amount, divisor, currencyCode, formatted };
}

function mapVariations(value: unknown): MappedVariation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      const v = (row ?? {}) as Record<string, unknown>;
      const formattedName = asString(
        v.formatted_name ?? v.formattedName ?? v.property_name ?? v.propertyName,
      );
      const formattedValue = asString(
        v.formatted_value ?? v.formattedValue ?? v.value ?? v.value_string,
      );
      if (!formattedName && !formattedValue) return null;
      return {
        propertyId: asNumber(v.property_id ?? v.propertyId),
        valueId: asNumber(v.value_id ?? v.valueId),
        formattedName: formattedName || 'Option',
        formattedValue: formattedValue || '—',
      };
    })
    .filter((x): x is MappedVariation => Boolean(x));
}

function mapLineItem(tx: Record<string, unknown>): MappedLineItem {
  const listingId = asNumber(tx.listing_id ?? tx.listingId);
  const listingImageId = asNumber(tx.listing_image_id ?? tx.listingImageId);
  return {
    transactionId: asString(tx.transaction_id ?? tx.transactionId),
    title: asString(tx.title),
    description: asString(tx.description),
    quantity: asNumber(tx.quantity) ?? 1,
    listingId,
    productId: asNumber(tx.product_id ?? tx.productId),
    sku: asString(tx.sku),
    isDigital: truthyFlag(tx.is_digital ?? tx.isDigital),
    fileData: asString(tx.file_data ?? tx.fileData),
    price: mapMoney(tx.price),
    shippingCost: mapMoney(tx.shipping_cost ?? tx.shippingCost),
    variations: mapVariations(tx.variations),
    productData: mapVariations(tx.product_data ?? tx.productData),
    shippedAt: unixToIso(tx.shipped_timestamp ?? tx.shippedTimestamp),
    paidAt: unixToIso(tx.paid_timestamp ?? tx.paidTimestamp),
    createdAt: unixToIso(
      tx.created_timestamp ?? tx.create_timestamp ?? tx.createdTimestamp ?? tx.createTimestamp,
    ),
    expectedShipDate: unixToIso(tx.expected_ship_date ?? tx.expectedShipDate),
    shippingMethod: asString(tx.shipping_method ?? tx.shippingMethod),
    shippingUpgrade: asString(tx.shipping_upgrade ?? tx.shippingUpgrade),
    shippingProfileId: asString(tx.shipping_profile_id ?? tx.shippingProfileId),
    minProcessingDays: asNumber(tx.min_processing_days ?? tx.minProcessingDays),
    maxProcessingDays: asNumber(tx.max_processing_days ?? tx.maxProcessingDays),
    buyerCoupon: asNumber(tx.buyer_coupon ?? tx.buyerCoupon),
    shopCoupon: asNumber(tx.shop_coupon ?? tx.shopCoupon),
    listingImageId,
    imageUrl: '',
  };
}

function mapShipment(row: Record<string, unknown>): MappedShipment {
  return {
    receiptShippingId: asString(row.receipt_shipping_id ?? row.receiptShippingId),
    trackingCode: asString(row.tracking_code ?? row.trackingCode),
    carrierName: asString(row.carrier_name ?? row.carrierName),
    notificationAt: unixToIso(
      row.shipment_notification_timestamp ?? row.shipmentNotificationTimestamp,
    ),
    mailingDate: unixToIso(row.mailing_date ?? row.mailingDate),
  };
}

function cleanRawReceipt(receipt: EtsyReceipt): Record<string, unknown> {
  const { _shippingBucket: _ignored, ...rest } = receipt;
  try {
    return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function truthyFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/** Parse explicit Etsy shipping-status phrases only (no fuzzy carrier words). */
export function parseEtsyShippingStatusText(raw: string): EtsyShippingStatus | null {
  const t = raw.toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (!t) return null;
  if (/\bcancel(?:led|ed)?\b/.test(t) || t.includes('fully refunded')) {
    return 'cancelled';
  }
  if (/\bpre\s*transit\b/.test(t) || t.includes('label created')) {
    return 'pre_transit';
  }
  if (/\bout\s*for\s*delivery\b/.test(t) || /\bin\s*transit\b/.test(t)) {
    return 'in_transit';
  }
  // Match delivered as a word — do NOT match random "deliver" substrings.
  if (/\bdelivered\b/.test(t)) return 'delivered';
  if (/\bno\s*tracking\b/.test(t)) return 'no_tracking';
  return null;
}

/**
 * Map receipt → Etsy seller-UI shipping labels.
 * Prefer the bucket from Etsy's was_shipped / was_delivered list filters.
 */
function shippingStatusFromReceipt(receipt: EtsyReceipt): {
  status: EtsyShippingStatus;
  etsyStatusRaw: string;
  trackingNumber: string;
  carrier: string;
} {
  const shipment = (receipt.shipments?.[0] ?? {}) as Record<string, unknown>;
  const trackingNumber = String(
    shipment.tracking_code ?? shipment.trackingCode ?? '',
  ).trim();
  const carrier = String(shipment.carrier_name ?? shipment.carrierName ?? '').trim();
  const receiptStatus = String(receipt.status ?? '').trim();
  const shipped =
    truthyFlag(receipt.is_shipped) || truthyFlag(receipt.was_shipped);
  const delivered =
    truthyFlag(receipt.was_delivered) || truthyFlag(receipt.is_delivered);

  const etsyStatusRaw = [
    receiptStatus && `status:${receiptStatus}`,
    shipped && 'is_shipped',
    delivered && 'is_delivered',
    trackingNumber ? 'has_tracking' : 'no_tracking_number',
    receipt._shippingBucket && `bucket:${receipt._shippingBucket}`,
  ]
    .filter(Boolean)
    .join(' | ');

  if (
    receipt._shippingBucket === 'cancelled' ||
    truthyFlag(receipt.is_canceled) ||
    truthyFlag(receipt.was_canceled) ||
    /cancel|fully refunded/i.test(receiptStatus)
  ) {
    return { status: 'cancelled', etsyStatusRaw, trackingNumber, carrier };
  }

  if (receipt._shippingBucket === 'delivered' || delivered) {
    return { status: 'delivered', etsyStatusRaw, trackingNumber, carrier };
  }

  if (receipt._shippingBucket) {
    return {
      status: receipt._shippingBucket,
      etsyStatusRaw,
      trackingNumber,
      carrier,
    };
  }

  // Fallback if fetched without buckets
  if (delivered) {
    return { status: 'delivered', etsyStatusRaw, trackingNumber, carrier };
  }
  if (!trackingNumber && !shipped) {
    return { status: 'no_tracking', etsyStatusRaw, trackingNumber, carrier };
  }
  if (trackingNumber && !shipped) {
    return { status: 'pre_transit', etsyStatusRaw, trackingNumber, carrier };
  }
  if (shipped && !delivered) {
    return {
      status: trackingNumber ? 'in_transit' : 'no_tracking',
      etsyStatusRaw,
      trackingNumber,
      carrier,
    };
  }
  return { status: 'no_tracking', etsyStatusRaw, trackingNumber, carrier };
}

async function fetchReceiptPage(
  creds: {
    keystring: string;
    sharedSecret: string;
    accessToken: string;
    shopId: number;
  },
  extra: Record<string, string>,
  minCreated: number,
): Promise<EtsyReceipt[]> {
  const limit = 100;
  let offset = 0;
  const all: EtsyReceipt[] = [];

  for (;;) {
    const params = new URLSearchParams({
      min_created: String(minCreated),
      limit: String(limit),
      offset: String(offset),
      ...extra,
    });
    const data = await etsyFetch<{ results?: EtsyReceipt[] }>(
      creds,
      `/shops/${creds.shopId}/receipts?${params.toString()}`,
    );
    const page = data.results ?? [];
    all.push(...page);
    if (page.length < limit) break;
    offset += limit;
    if (offset >= 5000) break;
  }

  return all;
}

function receiptTrackingNumber(receipt: EtsyReceipt): string {
  const shipment = (receipt.shipments?.[0] ?? {}) as Record<string, unknown>;
  return String(shipment.tracking_code ?? shipment.trackingCode ?? '').trim();
}

/**
 * Fetch receipts in Etsy Open API filter buckets.
 * Pre-transit vs In transit are not available from Open API; shipped + tracked
 * + not delivered is mapped coarsely to In transit.
 */
export async function fetchAllPaidReceipts(
  creds: {
    keystring: string;
    sharedSecret: string;
    accessToken: string;
    shopId: number;
  },
  minCreated: number,
): Promise<EtsyReceipt[]> {
  const [delivered, shippedNotDelivered, notShipped, canceled] = await Promise.all([
    fetchReceiptPage(
      creds,
      { was_paid: 'true', was_delivered: 'true' },
      minCreated,
    ).catch(() => [] as EtsyReceipt[]),
    fetchReceiptPage(
      creds,
      { was_paid: 'true', was_shipped: 'true', was_delivered: 'false' },
      minCreated,
    ).catch(() => [] as EtsyReceipt[]),
    fetchReceiptPage(
      creds,
      { was_paid: 'true', was_shipped: 'false' },
      minCreated,
    ).catch(() => [] as EtsyReceipt[]),
    fetchReceiptPage(creds, { was_canceled: 'true' }, minCreated).catch(
      () => [] as EtsyReceipt[],
    ),
  ]);

  const byId = new Map<string, EtsyReceipt>();

  // Lowest priority first; later buckets overwrite.
  for (const r of notShipped) {
    const id = String(r.receipt_id ?? '');
    if (!id) continue;
    // Tracking on file but Etsy still "not shipped" → Pre-transit.
    const bucket: EtsyShippingStatus = receiptTrackingNumber(r)
      ? 'pre_transit'
      : 'no_tracking';
    byId.set(id, { ...r, _shippingBucket: bucket });
  }

  for (const r of shippedNotDelivered) {
    const id = String(r.receipt_id ?? '');
    if (!id) continue;
    // Open API cannot split Etsy Pre-transit vs In transit — treat shipped +
    // tracked + not delivered as In transit (coarse).
    const bucket: EtsyShippingStatus = receiptTrackingNumber(r)
      ? 'in_transit'
      : 'no_tracking';
    byId.set(id, { ...r, _shippingBucket: bucket });
  }

  for (const r of delivered) {
    const id = String(r.receipt_id ?? '');
    if (!id) continue;
    byId.set(id, { ...r, _shippingBucket: 'delivered' });
  }

  for (const r of canceled) {
    const id = String(r.receipt_id ?? '');
    if (!id) continue;
    byId.set(id, { ...r, _shippingBucket: 'cancelled' });
  }

  return [...byId.values()];
}

/** Latest ship/dispatch instant from receipt transactions + shipments. */
export function receiptDispatchedAt(receipt: EtsyReceipt): string | null {
  const candidates: number[] = [];
  for (const t of receipt.transactions ?? []) {
    const ts = Number(t.shipped_timestamp ?? t.shippedTimestamp ?? 0);
    if (Number.isFinite(ts) && ts > 0) candidates.push(ts);
  }
  for (const shipment of receipt.shipments ?? []) {
    const ts = Number(
      shipment.shipment_notification_timestamp ??
        shipment.shipmentNotificationTimestamp ??
        shipment.mailing_date ??
        shipment.mailingDate ??
        0,
    );
    if (Number.isFinite(ts) && ts > 0) candidates.push(ts);
  }
  if (!candidates.length) return null;
  return new Date(Math.max(...candidates) * 1000).toISOString();
}

/** Etsy “ship by” / expected dispatch deadline (latest among line items). */
export function receiptShipByAt(receipt: EtsyReceipt): string | null {
  const candidates: number[] = [];
  for (const t of receipt.transactions ?? []) {
    const ts = Number(t.expected_ship_date ?? t.expectedShipDate ?? 0);
    if (Number.isFinite(ts) && ts > 0) candidates.push(ts);
  }
  if (!candidates.length) return null;
  return new Date(Math.max(...candidates) * 1000).toISOString();
}

export function mapReceiptToOrderFields(receipt: EtsyReceipt): {
  etsyOrderNumber: string;
  etsyReceiptId: string;
  customerName: string;
  product: string;
  trackingNumber: string;
  carrier: string;
  status: EtsyShippingStatus;
  etsyStatusRaw: string;
  createdAt: string;
  dispatchedAt: string | null;
  shipByAt: string | null;
  listingId: number | null;
  etsy: MappedEtsyDetails;
} {
  const id = asString(receipt.receipt_id);
  const lineItems = (receipt.transactions ?? []).map((t) =>
    mapLineItem((t ?? {}) as Record<string, unknown>),
  );
  const titles = lineItems
    .map((t) => {
      const qty = t.quantity > 1 ? ` ×${t.quantity}` : '';
      return t.title ? `${t.title}${qty}` : '';
    })
    .filter(Boolean);

  const mapped = shippingStatusFromReceipt(receipt);
  const createdAt =
    unixToIso(receipt.created_timestamp ?? receipt.create_timestamp) ||
    new Date().toISOString();

  const listingId = lineItems[0]?.listingId ?? null;

  const etsy: MappedEtsyDetails = {
    receiptId: id,
    receiptType: asString(receipt.receipt_type ?? receipt.receiptType),
    status: asString(receipt.status),
    isPaid: truthyFlag(receipt.is_paid ?? receipt.was_paid ?? receipt.isPaid),
    isShipped: truthyFlag(receipt.is_shipped ?? receipt.was_shipped),
    isDelivered: truthyFlag(receipt.is_delivered ?? receipt.was_delivered),
    isCanceled: truthyFlag(receipt.is_canceled ?? receipt.was_canceled),
    isGift: truthyFlag(receipt.is_gift ?? receipt.isGift),
    giftMessage: asString(receipt.gift_message ?? receipt.giftMessage),
    giftSender: asString(receipt.gift_sender ?? receipt.giftSender),
    sellerUserId: asString(receipt.seller_user_id ?? receipt.sellerUserId),
    sellerEmail: asString(receipt.seller_email ?? receipt.sellerEmail),
    buyerUserId: asString(receipt.buyer_user_id ?? receipt.buyerUserId),
    buyerEmail: asString(receipt.buyer_email ?? receipt.buyerEmail),
    paymentMethod: asString(receipt.payment_method ?? receipt.paymentMethod),
    paymentEmail: asString(receipt.payment_email ?? receipt.paymentEmail),
    messageFromBuyer: asString(receipt.message_from_buyer ?? receipt.messageFromBuyer),
    messageFromSeller: asString(receipt.message_from_seller ?? receipt.messageFromSeller),
    messageFromPayment: asString(receipt.message_from_payment ?? receipt.messageFromPayment),
    name: asString(receipt.name),
    firstLine: asString(receipt.first_line ?? receipt.firstLine),
    secondLine: asString(receipt.second_line ?? receipt.secondLine),
    city: asString(receipt.city),
    state: asString(receipt.state),
    zip: asString(receipt.zip),
    countryIso: asString(receipt.country_iso ?? receipt.countryIso),
    formattedAddress: asString(receipt.formatted_address ?? receipt.formattedAddress),
    createdAt: unixToIso(receipt.created_timestamp ?? receipt.create_timestamp),
    updatedAt: unixToIso(receipt.updated_timestamp ?? receipt.update_timestamp),
    subtotal: mapMoney(receipt.subtotal),
    totalPrice: mapMoney(receipt.total_price ?? receipt.totalPrice),
    totalShippingCost: mapMoney(receipt.total_shipping_cost ?? receipt.totalShippingCost),
    totalTaxCost: mapMoney(receipt.total_tax_cost ?? receipt.totalTaxCost),
    totalVatCost: mapMoney(receipt.total_vat_cost ?? receipt.totalVatCost),
    discountAmt: mapMoney(receipt.discount_amt ?? receipt.discountAmt),
    giftWrapPrice: mapMoney(receipt.gift_wrap_price ?? receipt.giftWrapPrice),
    grandtotal: mapMoney(receipt.grandtotal ?? receipt.grand_total),
    lineItems,
    shipments: (receipt.shipments ?? []).map((s) =>
      mapShipment((s ?? {}) as Record<string, unknown>),
    ),
    refunds: Array.isArray(receipt.refunds)
      ? (JSON.parse(JSON.stringify(receipt.refunds)) as Array<Record<string, unknown>>)
      : [],
    raw: cleanRawReceipt(receipt),
  };

  return {
    etsyOrderNumber: id,
    etsyReceiptId: id,
    customerName: asString(receipt.name),
    product: titles.join('; '),
    trackingNumber: mapped.trackingNumber,
    carrier: mapped.carrier,
    status: mapped.status,
    etsyStatusRaw: mapped.etsyStatusRaw,
    createdAt,
    dispatchedAt: receiptDispatchedAt(receipt),
    shipByAt: receiptShipByAt(receipt),
    listingId,
    etsy,
  };
}

/** Prefer large listing images for the order detail page. */
export async function fetchListingImageUrl(
  creds: { keystring: string; sharedSecret: string; accessToken: string },
  listingId: number,
  listingImageId?: number | null,
): Promise<string | null> {
  const pickUrl = (img?: {
    url_fullxfull?: string;
    url_570xN?: string;
    url_170x135?: string;
    url_75x75?: string;
  }) => img?.url_fullxfull || img?.url_570xN || img?.url_170x135 || img?.url_75x75 || null;

  try {
    if (listingImageId && Number.isFinite(listingImageId)) {
      const one = await etsyFetch<{
        url_fullxfull?: string;
        url_570xN?: string;
        url_170x135?: string;
        url_75x75?: string;
      }>(creds, `/listings/${listingId}/images/${listingImageId}`);
      const url = pickUrl(one);
      if (url) return url;
    }
  } catch {
    // fall through to listing images list
  }

  try {
    const data = await etsyFetch<{
      results?: Array<{
        url_fullxfull?: string;
        url_570xN?: string;
        url_170x135?: string;
        url_75x75?: string;
      }>;
    }>(creds, `/listings/${listingId}/images`);
    return pickUrl(data.results?.[0]);
  } catch {
    return null;
  }
}
