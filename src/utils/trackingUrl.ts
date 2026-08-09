const CARRIER_URLS: Record<string, (tn: string) => string> = {
  usps: (tn) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tn}`,
  ups: (tn) => `https://www.ups.com/track?tracknum=${tn}`,
  fedex: (tn) => `https://www.fedex.com/fedextrack/?trknbr=${tn}`,
  dhl: (tn) => `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${tn}`,
  'dhl ecommerce': (tn) =>
    `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${tn}`,
  yunexpress: (tn) => `https://www.yuntrack.com/parcelTracking?id=${tn}`,
  'yun express': (tn) => `https://www.yuntrack.com/parcelTracking?id=${tn}`,
  '4px': (tn) => `https://track.4px.com/#/result/0/${tn}`,
  cainiao: (tn) => `https://global.cainiao.com/detail.htm?mailNoList=${tn}`,
  'china post': (tn) => `https://t.17track.net/en#nums=${tn}`,
  'royal mail': (tn) =>
    `https://www.royalmail.com/track-your-item#/tracking-results/${tn}`,
  'canada post': (tn) =>
    `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${tn}`,
  aramex: (tn) => `https://www.aramex.com/track/results?ShipmentNumber=${tn}`,
  amazon: (tn) => `https://track.amazon.com/tracking/${tn}`,
  'amazon shipping': (tn) => `https://track.amazon.com/tracking/${tn}`,
  'amazon logistics': (tn) => `https://track.amazon.com/tracking/${tn}`,
  amzl: (tn) => `https://track.amazon.com/tracking/${tn}`,
  gofo: (tn) => `https://www.gofo.com/us/track?searchID=${tn}`,
  'gofo express': (tn) => `https://www.gofo.com/us/track?searchID=${tn}`,
};

function encodeTn(trackingNumber: string): string {
  return encodeURIComponent(trackingNumber.trim());
}

export function detectCarrierFromTracking(trackingNumber: string): string | undefined {
  const tn = trackingNumber.trim().toUpperCase();
  if (/^TB[ACM]\d+/i.test(tn)) return 'amazon';
  if (/^(GF|CI)(US|FR|NL|IT|ES|CA)\d+/i.test(tn)) return 'gofo';
  if (/^1Z[A-Z0-9]+$/i.test(tn)) return 'ups';
  if (/^\d{20,22}$/.test(tn)) return 'usps';
  if (/^YT\d+/i.test(tn) || /^LP\d+/i.test(tn)) return 'yunexpress';
  return undefined;
}

export function buildTrackingUrl(
  trackingNumber: string,
  carrier?: string | null,
): string | null {
  const tn = trackingNumber.trim();
  if (!tn) return null;
  if (/^https?:\/\//i.test(tn)) return tn;

  const encoded = encodeTn(tn);
  const detected = detectCarrierFromTracking(tn);
  const key = (carrier ?? '').trim().toLowerCase() || detected || '';

  if (detected === 'amazon' || key.startsWith('amazon') || key === 'amzl') {
    return `https://track.amazon.com/tracking/${encoded}`;
  }

  const builder = key ? CARRIER_URLS[key] : undefined;
  if (builder) return builder(encoded);
  return `https://t.17track.net/en#nums=${encoded}`;
}
