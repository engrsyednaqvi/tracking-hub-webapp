import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify Etsy webhook signature (Svix-style whsec_ secrets).
 * signed_content = webhook-id + "." + webhook-timestamp + "." + raw_body
 */
export function verifyEtsyWebhookSignature(params: {
  rawBody: string;
  webhookId: string;
  webhookTimestamp: string;
  webhookSignature: string;
  /** One or more whsec_… secrets (multi Seller apps). */
  secrets: string[];
  /** Max age / future skew in seconds (default 5 minutes). */
  toleranceSec?: number;
}): boolean {
  const { rawBody, webhookId, webhookTimestamp, webhookSignature } = params;
  const tolerance = params.toleranceSec ?? 300;
  if (!webhookId || !webhookTimestamp || !webhookSignature || !params.secrets.length) {
    return false;
  }

  const ts = Number(webhookTimestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > tolerance) return false;

  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const provided = webhookSignature
    .split(/\s+/)
    .map((part) => {
      const comma = part.indexOf(',');
      return comma >= 0 ? part.slice(comma + 1) : part;
    })
    .filter(Boolean);

  for (const secret of params.secrets) {
    const key = decodeWhsec(secret);
    if (!key) continue;
    const expected = createHmac('sha256', key).update(signedContent, 'utf8').digest('base64');
    for (const sig of provided) {
      if (signaturesMatch(sig, expected)) return true;
    }
  }
  return false;
}

function decodeWhsec(secret: string): Buffer | null {
  const trimmed = secret.trim();
  if (!trimmed) return null;
  const payload = trimmed.startsWith('whsec_') ? trimmed.slice('whsec_'.length) : trimmed;
  try {
    return Buffer.from(payload, 'base64');
  } catch {
    return null;
  }
}

function signaturesMatch(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** Parse newline/comma-separated webhook secrets from Secret Manager. */
export function parseWebhookSecrets(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== 'whsec_pending');
}
