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

/** Skip carriers that are clearly not USPS. */
function isClearlyNonUsps(carrier: string): boolean {
  const c = carrier.toLowerCase();
  if (c.includes('usps') || c.includes('postal') || c.includes('pitney')) return false;
  return /\b(ups|fed\s*ex|fedex|dhl|ontrac|laser.?ship|amazon\s*logistics)\b/.test(c);
}

/** Decide whether to call the USPS Tracking API for this number. */
export function shouldQueryUsps(trackingNumber: string, carrier = ''): boolean {
  const tn = trackingNumber.replace(/\s+/g, '').toUpperCase();
  if (!tn || tn.length < 8) return false;
  if (isClearlyNonUsps(carrier)) return false;

  const c = carrier.toLowerCase();
  if (c.includes('usps') || c.includes('postal') || c.includes('pitney')) return true;

  // Common USPS / IMpb / international patterns
  if (/^(94|93|92|95|23|03)\d{16,}$/.test(tn)) return true;
  if (/^420\d{25,}$/.test(tn)) return true;
  if (/^[A-Z]{2}\d{9}US$/.test(tn)) return true;
  if (/^E[A-Z]\d{9}US$/.test(tn)) return true;
  // Long digit strings are usually USPS when carrier is blank/unknown
  if (/^\d{20,34}$/.test(tn)) return true;
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
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: creds.consumerKey,
      client_secret: creds.consumerSecret,
      scope: 'tracking',
    }),
  });

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
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

/** Normalize either official statusCategory JSON or TrackSummary/Event shapes. */
export function extractUspsFields(data: Record<string, unknown>): {
  statusCategory: string;
  statusSummary: string;
  status: string;
} {
  const asRecord = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

  const str = (...vals: unknown[]) => {
    for (const v of vals) {
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };

  const trackSummary = asRecord(data.TrackSummary) ?? asRecord(data.trackSummary);
  const event = trackSummary ? str(trackSummary.Event, trackSummary.event) : '';
  const eventWhere = trackSummary
    ? [
        str(trackSummary.EventDate, trackSummary.eventDate),
        str(trackSummary.EventTime, trackSummary.eventTime),
        str(trackSummary.EventCity, trackSummary.eventCity),
        str(trackSummary.EventState, trackSummary.eventState),
        str(trackSummary.EventZIPCode, trackSummary.eventZIPCode),
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  const statusCategory = str(
    data.statusCategory,
    data.StatusCategory,
    event,
  );
  const status = str(data.status, data.Status, event);
  const statusSummary = str(
    data.statusSummary,
    data.StatusSummary,
    status,
    event && eventWhere ? `${event} · ${eventWhere}` : event,
  );

  // Fall back to first tracking event type when top-level fields are empty
  if (!statusCategory && !statusSummary) {
    const events = data.trackingEvents ?? data.TrackDetail ?? data.trackDetail;
    if (Array.isArray(events) && events.length) {
      const first = asRecord(events[0]);
      if (first) {
        const ev = str(first.eventType, first.Event, first.event, first.eventCode);
        if (ev) {
          return { statusCategory: ev, statusSummary: ev, status: ev };
        }
      }
    }
  }

  return { statusCategory, statusSummary, status };
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

  if (/\bdelivered\b/.test(blob)) return 'delivered';
  if (
    blob.includes('pre shipment') ||
    blob.includes('preshipment') ||
    blob.includes('pre shipment info') ||
    blob.includes('pre transit') ||
    blob.includes('label created') ||
    blob.includes('shipping label created') ||
    blob.includes('awaiting item') ||
    blob.includes('acceptance pending') ||
    blob.includes('electronic shipping info received') ||
    blob.includes('usps awaiting item')
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
    blob.includes('in possession') ||
    blob.includes('arrived') ||
    blob.includes('processed') ||
    blob.includes('distribution center') ||
    blob.includes('forwarded')
  ) {
    return 'in_transit';
  }
  if (blob.includes('alert') || blob.includes('exception') || blob.includes('return')) {
    return 'in_transit';
  }
  // Unknown but non-empty USPS text — treat as in transit so the column is not blank
  return 'in_transit';
}

/** True when USPS rejected the app/MID for Tracking API access (do not retry every package). */
export function isUspsTrackingAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return (
    /\b403\b/.test(msg) &&
    (/mid is not authorized/i.test(msg) ||
      /not authorized.*\/tracking/i.test(msg) ||
      /tracking api access/i.test(msg) ||
      /ip agreement/i.test(msg))
  );
}

function formatUspsHttpError(status: number, body: string): string {
  const compact = body.replace(/\s+/g, ' ').trim();
  let apiMessage = '';
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; code?: string };
      message?: string;
    };
    apiMessage = String(parsed.error?.message || parsed.message || '').trim();
  } catch {
    apiMessage = compact.slice(0, 280);
  }

  if (
    status === 403 &&
    (/mid is not authorized/i.test(apiMessage) || /not authorized/i.test(apiMessage))
  ) {
    return (
      'USPS Tracking API access denied (MID not authorized). Since Apr 2026 USPS requires ' +
      'Tracking API Access Control: link your MID in COP (cop.usps.com) and submit an IP Agreement ' +
      'via https://emailus.usps.com/s/usps-APIs or call 1-877-672-0007 (opt 6 then 2). ' +
      'Etsy/Pitney labels may remain untrackable under your personal MID.'
    );
  }

  return `USPS tracking failed (${status}): ${apiMessage || compact}`.slice(0, 500);
}

export async function fetchUspsTrackingStatus(
  creds: { consumerKey: string; consumerSecret: string },
  trackingNumber: string,
  carrier = '',
): Promise<UspsTrackingResult | null> {
  const tn = trackingNumber.replace(/\s+/g, '').trim();
  if (!tn || !shouldQueryUsps(tn, carrier)) return null;

  const accessToken = await getUspsAccessToken(creds);
  const response = await fetch(`${TRACK_URL}/${encodeURIComponent(tn)}?expand=DETAIL`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  const text = await response.text();
  if (!response.ok) {
    // 404 = not a USPS number / not found yet — skip quietly
    if (response.status === 404) return null;
    throw new Error(formatUspsHttpError(response.status, text));
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`USPS tracking returned non-JSON: ${text.slice(0, 200)}`);
  }

  const fields = extractUspsFields(parsed);
  const status = statusFromUspsTracking(fields);

  return {
    status,
    statusCategory: fields.statusCategory,
    statusSummary: fields.statusSummary || fields.statusCategory || fields.status,
    raw: [
      fields.statusCategory && `uspsCategory:${fields.statusCategory}`,
      fields.statusSummary && `uspsSummary:${fields.statusSummary}`,
    ]
      .filter(Boolean)
      .join(' | '),
  };
}
