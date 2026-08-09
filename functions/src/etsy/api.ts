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
  transactions?: Array<{ title?: string; quantity?: number }>;
  shipments?: Array<{ tracking_code?: string; carrier_name?: string }>;
}

function truthyFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export async function fetchAllPaidReceipts(
  creds: {
    keystring: string;
    sharedSecret: string;
    accessToken: string;
    shopId: number;
  },
  minCreated: number,
): Promise<EtsyReceipt[]> {
  const limit = 100;
  let offset = 0;
  const all: EtsyReceipt[] = [];

  for (;;) {
    const params = new URLSearchParams({
      was_paid: 'true',
      min_created: String(minCreated),
      limit: String(limit),
      offset: String(offset),
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

export function mapReceiptToOrderFields(receipt: EtsyReceipt): {
  etsyOrderNumber: string;
  etsyReceiptId: string;
  customerName: string;
  product: string;
  trackingNumber: string;
  carrier: string;
  status: 'waiting' | 'in_transit' | 'delivered';
  createdAt: string;
} {
  const id = String(receipt.receipt_id ?? '').trim();
  const titles = (receipt.transactions ?? [])
    .map((t) => {
      const title = String(t.title ?? '').trim();
      const qty = t.quantity && t.quantity > 1 ? ` ×${t.quantity}` : '';
      return title ? `${title}${qty}` : '';
    })
    .filter(Boolean);

  // Etsy often omits is_delivered; completed receipts are finished/delivered.
  const etsyStatus = String(receipt.status ?? '').toLowerCase().trim();
  let status: 'waiting' | 'in_transit' | 'delivered' = 'waiting';
  if (
    truthyFlag(receipt.was_delivered) ||
    truthyFlag(receipt.is_delivered) ||
    etsyStatus === 'completed'
  ) {
    status = 'delivered';
  } else if (truthyFlag(receipt.is_shipped) || truthyFlag(receipt.was_shipped)) {
    status = 'in_transit';
  }

  const unix = receipt.created_timestamp ?? receipt.create_timestamp;
  const createdAt =
    unix && unix > 0 ? new Date(unix * 1000).toISOString() : new Date().toISOString();

  const shipment = receipt.shipments?.[0];

  return {
    etsyOrderNumber: id,
    etsyReceiptId: id,
    customerName: String(receipt.name ?? '').trim(),
    product: titles.join('; '),
    trackingNumber: String(shipment?.tracking_code ?? '').trim(),
    carrier: String(shipment?.carrier_name ?? '').trim(),
    status,
    createdAt,
  };
}
