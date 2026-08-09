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

async function postToken(
  creds: { keystring: string; sharedSecret: string },
  body: Record<string, string>,
): Promise<TokenResponse> {
  // Etsy requires x-api-key as keystring:shared_secret on all API/token requests (enforced 2026).
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-api-key': `${creds.keystring}:${creds.sharedSecret}`,
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
  return postToken(
    { keystring: params.keystring, sharedSecret: params.sharedSecret },
    {
      grant_type: 'authorization_code',
      client_id: params.keystring,
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
  return postToken(
    { keystring: params.keystring, sharedSecret: params.sharedSecret },
    {
      grant_type: 'refresh_token',
      client_id: params.keystring,
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
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      'x-api-key': `${creds.keystring}:${creds.sharedSecret}`,
      Authorization: `Bearer ${creds.accessToken}`,
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
  try {
    const me = await etsyFetch<{ user_id?: string | number; shop_id?: string | number | null }>(
      creds,
      '/users/me',
    );
    const shopId = toShopId(me.shop_id);
    const userId = me.user_id != null ? String(me.user_id) : undefined;
    if (shopId) {
      try {
        const shop = await etsyFetch<{ shop_name?: string }>(creds, `/shops/${shopId}`);
        return { shopId, shopName: shop.shop_name ?? `Shop ${shopId}`, userId };
      } catch {
        return { shopId, shopName: `Shop ${shopId}`, userId };
      }
    }
    if (userId) {
      const byOwner = await etsyFetch<unknown>(creds, `/users/${userId}/shops`);
      const shop = pickShop(byOwner);
      const ownerShopId = toShopId(shop?.shop_id);
      if (ownerShopId) {
        return {
          shopId: ownerShopId,
          shopName: shop?.shop_name ?? `Shop ${ownerShopId}`,
          userId,
        };
      }
    }
  } catch {
    // fall through
  }

  if (!creds.userId) {
    throw new Error('Could not resolve your Etsy user. Try Connect again with your seller account.');
  }
  const byTokenUser = await etsyFetch<unknown>(creds, `/users/${creds.userId}/shops`);
  const shop = pickShop(byTokenUser);
  const shopId = toShopId(shop?.shop_id);
  if (!shopId) {
    throw new Error('No Etsy shop found for this account.');
  }
  return {
    shopId,
    shopName: shop?.shop_name ?? `Shop ${shopId}`,
    userId: creds.userId,
  };
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
  transactions?: Array<{
    title?: string;
    quantity?: number;
    listing_id?: number | string;
    listing_image_id?: number | string;
  }>;
  shipments?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

function truthyFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function collectStrings(value: unknown, into: string[], depth = 0): void {
  if (depth > 3 || value == null) return;
  if (typeof value === 'string' || typeof value === 'number') {
    into.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, into, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStrings(v, into, depth + 1);
    }
  }
}

/** Parse Etsy / carrier status text into our five shipping statuses. */
export function parseEtsyShippingStatusText(raw: string): EtsyShippingStatus | null {
  const t = raw.toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (!t) return null;
  if (
    t.includes('cancel') ||
    t.includes('fully refunded') ||
    t.includes('partially refunded')
  ) {
    return 'cancelled';
  }
  if (t.includes('deliver')) return 'delivered';
  if (t.includes('pre transit') || t.includes('pretransit') || t.includes('label created')) {
    return 'pre_transit';
  }
  if (
    t.includes('in transit') ||
    t.includes('out for delivery') ||
    t.includes('accepted') ||
    t.includes('departed') ||
    t.includes('arrived') ||
    t.includes('on the way')
  ) {
    return 'in_transit';
  }
  if (
    t.includes('no tracking') ||
    t.includes('not shipped') ||
    t === 'unshipped' ||
    t === 'pending'
  ) {
    return 'no_tracking';
  }
  return null;
}

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
  const hints: string[] = [];
  if (receiptStatus) hints.push(receiptStatus);

  // Prefer explicit tracking-status style fields when Etsy/partners include them.
  for (const key of [
    'tracking_status',
    'trackingStatus',
    'mail_status',
    'mailStatus',
    'shipment_status',
    'shipmentStatus',
    'shipping_status',
    'shippingStatus',
    'delivery_status',
    'deliveryStatus',
    'current_status',
    'currentStatus',
    'status',
    'major_tracking_state',
    'majorTrackingState',
  ]) {
    const v = shipment[key] ?? receipt[key];
    if (typeof v === 'string' || typeof v === 'number') hints.push(String(v));
  }
  collectStrings(shipment, hints);

  let fromText: EtsyShippingStatus | null = null;
  for (const hint of hints) {
    fromText = parseEtsyShippingStatusText(hint);
    if (fromText && fromText !== 'no_tracking') break;
    if (fromText === 'no_tracking' && !trackingNumber) break;
  }

  const etsyStatusRaw = hints.filter(Boolean).slice(0, 6).join(' | ');

  if (
    truthyFlag(receipt.is_canceled) ||
    truthyFlag(receipt.was_canceled) ||
    fromText === 'cancelled' ||
    parseEtsyShippingStatusText(receiptStatus) === 'cancelled'
  ) {
    return { status: 'cancelled', etsyStatusRaw, trackingNumber, carrier };
  }

  if (
    truthyFlag(receipt.was_delivered) ||
    truthyFlag(receipt.is_delivered) ||
    fromText === 'delivered' ||
    receiptStatus.toLowerCase() === 'completed'
  ) {
    return { status: 'delivered', etsyStatusRaw, trackingNumber, carrier };
  }

  if (fromText === 'in_transit') {
    return { status: 'in_transit', etsyStatusRaw, trackingNumber, carrier };
  }
  if (fromText === 'pre_transit') {
    return { status: 'pre_transit', etsyStatusRaw, trackingNumber, carrier };
  }

  // No carrier-status text from API — approximate from tracking presence (Etsy UI).
  if (!trackingNumber) {
    return { status: 'no_tracking', etsyStatusRaw, trackingNumber, carrier };
  }

  // Has a tracking number but not delivered: Etsy usually starts at Pre-transit
  // until the carrier scans (In transit). Public API often omits that scan state.
  return { status: 'pre_transit', etsyStatusRaw, trackingNumber, carrier };
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

/** Paid + canceled receipts in the window (deduped). */
export async function fetchAllPaidReceipts(
  creds: {
    keystring: string;
    sharedSecret: string;
    accessToken: string;
    shopId: number;
  },
  minCreated: number,
): Promise<EtsyReceipt[]> {
  const [paid, canceled] = await Promise.all([
    fetchReceiptPage(creds, { was_paid: 'true' }, minCreated),
    fetchReceiptPage(creds, { was_canceled: 'true' }, minCreated).catch(() => [] as EtsyReceipt[]),
  ]);

  const byId = new Map<string, EtsyReceipt>();
  for (const r of [...paid, ...canceled]) {
    const id = String(r.receipt_id ?? '');
    if (!id) continue;
    byId.set(id, r);
  }
  return [...byId.values()];
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
  listingId: number | null;
} {
  const id = String(receipt.receipt_id ?? '').trim();
  const titles = (receipt.transactions ?? [])
    .map((t) => {
      const title = String(t.title ?? '').trim();
      const qty = t.quantity && t.quantity > 1 ? ` ×${t.quantity}` : '';
      return title ? `${title}${qty}` : '';
    })
    .filter(Boolean);

  const mapped = shippingStatusFromReceipt(receipt);

  const unix = receipt.created_timestamp ?? receipt.create_timestamp;
  const createdAt =
    unix && unix > 0 ? new Date(unix * 1000).toISOString() : new Date().toISOString();

  const listingRaw = receipt.transactions?.[0]?.listing_id;
  const listingId =
    listingRaw != null && Number.isFinite(Number(listingRaw)) ? Number(listingRaw) : null;

  return {
    etsyOrderNumber: id,
    etsyReceiptId: id,
    customerName: String(receipt.name ?? '').trim(),
    product: titles.join('; '),
    trackingNumber: mapped.trackingNumber,
    carrier: mapped.carrier,
    status: mapped.status,
    etsyStatusRaw: mapped.etsyStatusRaw,
    createdAt,
    listingId,
  };
}

/** Fetch first listing thumbnail (cached per sync via caller). */
export async function fetchListingImageUrl(
  creds: { keystring: string; sharedSecret: string; accessToken: string },
  listingId: number,
): Promise<string | null> {
  try {
    const data = await etsyFetch<{
      results?: Array<{ url_170x135?: string; url_75x75?: string; url_570xN?: string }>;
    }>(creds, `/listings/${listingId}/images`);
    const img = data.results?.[0];
    return img?.url_170x135 || img?.url_75x75 || img?.url_570xN || null;
  } catch {
    return null;
  }
}
