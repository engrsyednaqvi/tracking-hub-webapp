import type { EtsyShippingStatus } from '../etsy/api';

const TOKEN_URL = 'https://apis.usps.com/oauth2/v3/token';
const TRACK_URL = 'https://apis.usps.com/tracking/v3/tracking';

interface UspsTokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: UspsTokenCache | null = null;

export interface UspsTrackingResult {
  status: EtsyShippingStatus | null;
  statusCategory: string;
  statusSummary: string;
  raw: string;
}

function looksLikeUsps(trackingNumber: string, carrier: string): boolean {
  const tn = trackingNumber.replace(/\s+/g, '').toUpperCase();
  const c = carrier.toLowerCase();
  if (c.includes('usps') || c.includes('united states postal')) return true;
  // Common USPS patterns (incl. Etsy/Pitney-style 9300…)
  if (/^(94|93|92|95)\d{18,22}$/.test(tn)) return true;
  if (/^[A-Z]{2}\d{9}US$/.test(tn)) return true;
  if (/^E\D{1}\d{9}US$/.test(tn)) return true;
  return false;
}

export async function getUspsAccessToken(creds: {
  consumerKey: string;
  consumerSecret: string;
}): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: creds.consumerKey,
      client_secret: creds.consumerSecret,
      scope: 'tracking',
    }).toString(),
  });

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
    scope?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(
      `USPS token failed (${response.status}): ${data.error_description || data.error || 'unknown'}`,
    );
  }

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(60, (data.expires_in ?? 3600) - 60) * 1000,
  };
  return data.access_token;
}

/** Map USPS statusCategory / summary text → dashboard status. */
export function statusFromUspsTracking(input: {
  statusCategory?: string;
  statusSummary?: string;
  status?: string;
}): EtsyShippingStatus | null {
  const blob = [input.statusCategory, input.statusSummary, input.status]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_-]+/g, ' ');

  if (!blob.trim()) return null;

  if (/\bdelivered\b/.test(blob) || blob.includes('delivered')) return 'delivered';
  if (
    blob.includes('pre shipment') ||
    blob.includes('preshipment') ||
    blob.includes('pre-shipment') ||
    blob.includes('pre transit') ||
    blob.includes('pre-transit') ||
    blob.includes('label created') ||
    blob.includes('shipping label created') ||
    blob.includes('awaiting item') ||
    blob.includes('acceptance pending')
  ) {
    return 'pre_transit';
  }
  if (
    blob.includes('in transit') ||
    blob.includes('out for delivery') ||
    blob.includes('arrived at') ||
    blob.includes('departed') ||
    blob.includes('moving through') ||
    blob.includes('accepted') ||
    blob.includes('in possession')
  ) {
    return 'in_transit';
  }
  if (blob.includes('alert') || blob.includes('exception') || blob.includes('return')) {
    return 'in_transit';
  }
  return null;
}

export async function fetchUspsTrackingStatus(
  creds: { consumerKey: string; consumerSecret: string },
  trackingNumber: string,
  carrier = '',
): Promise<UspsTrackingResult | null> {
  const tn = trackingNumber.replace(/\s+/g, '').trim();
  if (!tn || !looksLikeUsps(tn, carrier)) return null;

  const accessToken = await getUspsAccessToken(creds);
  const response = await fetch(`${TRACK_URL}/${encodeURIComponent(tn)}?expand=DETAIL`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`USPS tracking failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = JSON.parse(text) as {
    statusCategory?: string;
    statusSummary?: string;
    status?: string;
    trackingEvents?: Array<{ eventType?: string }>;
  };

  const status = statusFromUspsTracking({
    statusCategory: data.statusCategory,
    statusSummary: data.statusSummary,
    status: data.status,
  });

  return {
    status,
    statusCategory: String(data.statusCategory ?? ''),
    statusSummary: String(data.statusSummary ?? data.status ?? ''),
    raw: [
      data.statusCategory && `uspsCategory:${data.statusCategory}`,
      (data.statusSummary || data.status) &&
        `uspsSummary:${data.statusSummary || data.status}`,
    ]
      .filter(Boolean)
      .join(' | '),
  };
}
