import { randomBytes } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import {
  FieldValue,
  getFirestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  fetchAllShopsForUser,
  userIdFromAccessToken,
} from './etsy/api';
import { type OAuthAppCreds } from './etsy/credentials';
import {
  statusesFromShipmentsByOrder,
  type ShipmentsByOrderResponse,
} from './etsy/missionControl';
import { createCodeChallenge, createCodeVerifier, createOAuthState } from './etsy/pkce';
import { parseWebhookSecrets, verifyEtsyWebhookSignature } from './etsy/webhookSignature';
import { errorMessage, rethrowAsHttpsError } from './errors';
import {
  findShopsByEtsyShopId,
  listAllConnectedShops,
  syncShopDocuments,
} from './sync/etsyOrders';

// Gen2 can load modules more than once — always bind a default app.
const adminApp = getApps()[0] ?? initializeApp();

const etsyKeystring = defineSecret('ETSY_KEYSTRING');
const etsySharedSecret = defineSecret('ETSY_SHARED_SECRET');
const uspsConsumerKey = defineSecret('USPS_CONSUMER_KEY');
const uspsConsumerSecret = defineSecret('USPS_CONSUMER_SECRET');
/** Newline or comma-separated whsec_… secrets (one per Seller app webhook). */
const etsyWebhookSecrets = defineSecret('ETSY_WEBHOOK_SECRETS');
const webappOrigin = defineString('WEBAPP_ORIGIN', {
  default: 'https://engrsyednaqvi.github.io/tracking-hub-webapp',
});

const REDIRECT_URI =
  'https://us-central1-tracking-hub-webapp-29401.cloudfunctions.net/etsyOAuthCallback';

const WEBHOOK_URL =
  'https://us-central1-tracking-hub-webapp-29401.cloudfunctions.net/etsyWebhook';

function db() {
  return getFirestore(adminApp);
}

function createId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

/** Resolve Etsy app keys: per-request → saved shop creds → global secrets. */
async function resolveEtsyAppCreds(
  uid: string,
  input: { keystring?: unknown; sharedSecret?: unknown; shopId?: unknown },
): Promise<OAuthAppCreds> {
  const fromRequestKey =
    typeof input.keystring === 'string' ? input.keystring.trim() : '';
  const fromRequestSecret =
    typeof input.sharedSecret === 'string' ? input.sharedSecret.trim() : '';
  if (fromRequestKey && fromRequestSecret) {
    return { keystring: fromRequestKey, sharedSecret: fromRequestSecret };
  }

  const shopId = typeof input.shopId === 'string' ? input.shopId.trim() : '';
  if (shopId) {
    const snap = await db()
      .collection('users')
      .doc(uid)
      .collection('etsyCredentials')
      .doc(shopId)
      .get();
    const data = snap.data() as { keystring?: string; sharedSecret?: string } | undefined;
    const key = String(data?.keystring ?? '').trim();
    const secret = String(data?.sharedSecret ?? '').trim();
    if (key && secret) {
      return { keystring: key, sharedSecret: secret };
    }
    throw new HttpsError(
      'failed-precondition',
      'No Etsy app keys saved for this shop. Paste that shop’s Seller app keystring + shared secret, then Connect.',
    );
  }

  const keystring = etsyKeystring.value().trim();
  const sharedSecret = etsySharedSecret.value().trim();
  if (!keystring || !sharedSecret) {
    throw new HttpsError(
      'failed-precondition',
      'Paste the Etsy Seller app keystring + shared secret for the account you are connecting.',
    );
  }
  return { keystring, sharedSecret };
}

function globalFallbackCreds(): OAuthAppCreds {
  return {
    keystring: etsyKeystring.value().trim(),
    sharedSecret: etsySharedSecret.value().trim(),
  };
}

function uspsCreds() {
  return {
    consumerKey: uspsConsumerKey.value().trim(),
    consumerSecret: uspsConsumerSecret.value().trim(),
  };
}

/** Start Etsy OAuth — returns authorize URL for the browser. */
export const etsyOAuthStart = onCall(
  { secrets: [etsyKeystring, etsySharedSecret], cors: true },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in first.');
    }

    const { keystring, sharedSecret } = await resolveEtsyAppCreds(
      request.auth.uid,
      request.data ?? {},
    );
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);
    const state = createOAuthState();

    await db()
      .collection('oauthSessions')
      .doc(state)
      .set({
        uid: request.auth.uid,
        codeVerifier,
        keystring,
        sharedSecret,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

    const authUrl = buildAuthorizeUrl({
      keystring,
      redirectUri: REDIRECT_URI,
      state,
      codeChallenge,
    });

    return { authUrl, redirectUri: REDIRECT_URI };
  },
);

/** OAuth redirect callback from Etsy. */
export const etsyOAuthCallback = onRequest(
  { secrets: [etsyKeystring, etsySharedSecret], cors: false },
  async (req, res) => {
    const origin = webappOrigin.value().replace(/\/$/, '');
    const fail = (message: string) => {
      res.redirect(`${origin}/shops?etsy=error&message=${encodeURIComponent(message)}`);
    };

    try {
      const code = String(req.query.code ?? '');
      const state = String(req.query.state ?? '');
      const error = String(req.query.error ?? '');
      if (error) {
        fail(String(req.query.error_description || error));
        return;
      }
      if (!code || !state) {
        fail('Missing OAuth code or state.');
        return;
      }

      const sessionRef = db().collection('oauthSessions').doc(state);
      const sessionSnap = await sessionRef.get();
      if (!sessionSnap.exists) {
        fail('OAuth session expired. Start Connect again.');
        return;
      }
      const session = sessionSnap.data() as {
        uid: string;
        codeVerifier: string;
        expiresAt: number;
        keystring?: string;
        sharedSecret?: string;
      };
      await sessionRef.delete();
      if (session.expiresAt < Date.now()) {
        fail('OAuth session expired. Start Connect again.');
        return;
      }

      const keystring = String(session.keystring || etsyKeystring.value()).trim();
      const sharedSecret = String(session.sharedSecret || etsySharedSecret.value()).trim();
      if (!keystring || !sharedSecret) {
        fail('OAuth session missing Etsy app keys. Start Connect again with keystring + secret.');
        return;
      }
      const token = await exchangeAuthorizationCode({
        keystring,
        sharedSecret,
        code,
        codeVerifier: session.codeVerifier,
        redirectUri: REDIRECT_URI,
      });

      const etsyUserId = userIdFromAccessToken(token.access_token);
      const shops = await fetchAllShopsForUser({
        keystring,
        sharedSecret,
        accessToken: token.access_token,
        userId: etsyUserId,
      });

      const now = new Date().toISOString();
      const expiresAt = Date.now() + Math.max(60, token.expires_in - 60) * 1000;
      const shopsCol = db().collection('users').doc(session.uid).collection('shops');
      const connectedNames: string[] = [];

      for (const shop of shops) {
        const existing = await shopsCol
          .where('etsyShopId', '==', String(shop.shopId))
          .limit(1)
          .get();

        let shopDocId: string;
        if (!existing.empty) {
          shopDocId = existing.docs[0]!.id;
          await shopsCol.doc(shopDocId).set(
            {
              name: shop.shopName,
              platform: 'etsy',
              connected: true,
              reconnectRequired: false,
              reconnectReason: FieldValue.delete(),
              etsyShopId: String(shop.shopId),
              etsyUserId: shop.userId ?? etsyUserId,
              updatedAt: now,
            },
            { merge: true },
          );
        } else {
          shopDocId = createId('shop');
          await shopsCol.doc(shopDocId).set({
            id: shopDocId,
            name: shop.shopName,
            platform: 'etsy',
            connected: true,
            reconnectRequired: false,
            etsyShopId: String(shop.shopId),
            etsyUserId: shop.userId ?? etsyUserId,
            createdAt: now,
            updatedAt: now,
          });
        }

        // Per-shop Seller app keys + tokens (Admin SDK only; clients cannot read).
        await db()
          .collection('users')
          .doc(session.uid)
          .collection('etsyCredentials')
          .doc(shopDocId)
          .set({
            shopDocId,
            etsyShopId: shop.shopId,
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            expiresAt,
            etsyUserId: shop.userId ?? etsyUserId,
            etsyClientId: keystring,
            keystring,
            sharedSecret,
            updatedAt: now,
          });

        connectedNames.push(shop.shopName);
      }

      const label =
        connectedNames.length === 1
          ? connectedNames[0]!
          : `${connectedNames.length} shops (${connectedNames.join(', ')})`;

      res.redirect(
        `${origin}/shops?etsy=connected&shop=${encodeURIComponent(label)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Etsy connect failed';
      fail(message);
    }
  },
);

/** Sync paid receipts for one shop (or all connected shops). */
export const etsySync = onCall(
  {
    secrets: [etsyKeystring, etsySharedSecret, uspsConsumerKey, uspsConsumerSecret],
    cors: true,
    timeoutSeconds: 300,
  },
  async (request) => {
    try {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Sign in first.');
      }
      const uid = request.auth.uid;
      const shopId = typeof request.data?.shopId === 'string' ? request.data.shopId : null;
      const syncDays = Math.min(
        365,
        Math.max(1, Number(request.data?.syncDays ?? 30) || 30),
      );

      const shopsCol = db().collection('users').doc(uid).collection('shops');
      let shopDocs: QueryDocumentSnapshot[];
      if (shopId) {
        const one = await shopsCol.doc(shopId).get();
        if (!one.exists) throw new HttpsError('not-found', 'Shop not found.');
        shopDocs = [one as QueryDocumentSnapshot];
      } else {
        const all = await shopsCol.where('connected', '==', true).get();
        shopDocs = all.docs;
      }

      shopDocs = shopDocs.filter((doc) => doc.get('reconnectRequired') !== true);

      if (!shopDocs.length) {
        throw new HttpsError(
          'failed-precondition',
          'No connected Etsy shops to sync. If a shop says reconnect, use Reconnect Etsy (login) first — Sync cannot fix invalid tokens.',
        );
      }

      const result = await syncShopDocuments({
        uid,
        shopDocs,
        syncDays,
        globalFallback: globalFallbackCreds(),
        uspsCreds: uspsCreds(),
        enrichUsps: true,
      });

      if (result.shopErrors.length && result.created === 0 && result.updated === 0) {
        throw new HttpsError('failed-precondition', result.shopErrors.join('\n'), {
          shopErrors: result.shopErrors,
          fullMessage: result.shopErrors.join('\n'),
        });
      }

      return result;
    } catch (err) {
      rethrowAsHttpsError(err, 'Etsy sync failed');
    }
  },
);

/**
 * Etsy order webhooks (order.paid / canceled / shipped / delivered).
 * Configure this URL in each Seller app’s Webhook portal.
 */
export const etsyWebhook = onRequest(
  {
    secrets: [
      etsyKeystring,
      etsySharedSecret,
      uspsConsumerKey,
      uspsConsumerSecret,
      etsyWebhookSecrets,
    ],
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    if (req.method === 'GET') {
      res.status(200).json({
        ok: true,
        endpoint: WEBHOOK_URL,
        events: ['order.paid', 'order.canceled', 'order.shipped', 'order.delivered'],
      });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const rawBody =
      typeof req.rawBody !== 'undefined'
        ? Buffer.isBuffer(req.rawBody)
          ? req.rawBody.toString('utf8')
          : String(req.rawBody)
        : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body ?? {});

    const secrets = parseWebhookSecrets(etsyWebhookSecrets.value());
    const webhookId = String(req.get('webhook-id') || '');
    const webhookTimestamp = String(req.get('webhook-timestamp') || '');
    const webhookSignature = String(req.get('webhook-signature') || '');

    if (!secrets.length) {
      console.warn(
        '[etsyWebhook] ETSY_WEBHOOK_SECRETS not set (or still whsec_pending). Rejecting.',
      );
      res.status(503).json({
        error: 'Webhook secrets not configured. Set ETSY_WEBHOOK_SECRETS in Firebase.',
      });
      return;
    }

    const valid = verifyEtsyWebhookSignature({
      rawBody,
      webhookId,
      webhookTimestamp,
      webhookSignature,
      secrets,
    });
    if (!valid) {
      console.warn('[etsyWebhook] invalid signature');
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    let payload: { event_type?: string; shop_id?: string | number; resource_url?: string };
    try {
      payload = JSON.parse(rawBody) as typeof payload;
    } catch {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }

    const eventType = String(payload.event_type || '');
    const shopId = payload.shop_id;
    if (shopId === undefined || shopId === null || shopId === '') {
      res.status(400).json({ error: 'Missing shop_id' });
      return;
    }

    console.log(`[etsyWebhook] ${eventType} shop=${shopId}`);

    const matches = await findShopsByEtsyShopId(shopId);
    if (!matches.length) {
      // Acknowledge so Etsy does not retry forever for unknown shops.
      res.status(200).json({ ok: true, synced: 0, reason: 'no_matching_shop' });
      return;
    }

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const { uid, shopDoc } of matches) {
      try {
        const result = await syncShopDocuments({
          uid,
          shopDocs: [shopDoc],
          syncDays: 14,
          globalFallback: globalFallbackCreds(),
          uspsCreds: uspsCreds(),
          // Fast path — scheduled job does USPS enrichment.
          enrichUsps: false,
        });
        created += result.created;
        updated += result.updated;
        if (result.shopErrors.length) errors.push(...result.shopErrors);
      } catch (err) {
        errors.push(errorMessage(err));
      }
    }

    res.status(200).json({
      ok: true,
      eventType,
      shops: matches.length,
      created,
      updated,
      errors,
    });
  },
);

/**
 * Background sync for all connected shops (works with the website closed).
 * Complements Etsy webhooks for missed events + USPS enrichment.
 */
export const etsyScheduledSync = onSchedule(
  {
    schedule: 'every 30 minutes',
    timeZone: 'America/New_York',
    secrets: [etsyKeystring, etsySharedSecret, uspsConsumerKey, uspsConsumerSecret],
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async () => {
    const shops = await listAllConnectedShops();
    console.log(`[etsyScheduledSync] ${shops.length} connected shop(s)`);

    // Group by uid so we reuse one orders collection write path per user.
    const byUid = new Map<string, QueryDocumentSnapshot[]>();
    for (const { uid, shopDoc } of shops) {
      const list = byUid.get(uid) ?? [];
      list.push(shopDoc);
      byUid.set(uid, list);
    }

    let created = 0;
    let updated = 0;
    let shopErrors = 0;

    for (const [uid, shopDocs] of byUid) {
      try {
        const result = await syncShopDocuments({
          uid,
          shopDocs,
          syncDays: 30,
          globalFallback: globalFallbackCreds(),
          uspsCreds: uspsCreds(),
          enrichUsps: true,
        });
        created += result.created;
        updated += result.updated;
        shopErrors += result.shopErrors.length;
        if (result.shopErrors.length) {
          console.error(`[etsyScheduledSync] uid=${uid}`, result.shopErrors.join(' | '));
        }
      } catch (err) {
        shopErrors += 1;
        console.error(`[etsyScheduledSync] uid=${uid}`, errorMessage(err));
      }
    }

    console.log(
      `[etsyScheduledSync] done created=${created} updated=${updated} shopErrors=${shopErrors}`,
    );
  },
);

/**
 * Apply Mission Control /shipments/by-order JSON (majorTrackingState) onto orders.
 * Paste the Network response from Etsy seller hub — OAuth cannot call that endpoint.
 */
export const etsyApplyShipmentsByOrder = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }
  const uid = request.auth.uid;
  const payload = request.data?.payload as ShipmentsByOrderResponse | undefined;
  if (!payload || typeof payload !== 'object') {
    throw new HttpsError(
      'invalid-argument',
      'Send { payload } from Etsy /shipments/by-order JSON.',
    );
  }

  const mapped = statusesFromShipmentsByOrder(payload);
  if (!mapped.size) {
    throw new HttpsError(
      'invalid-argument',
      'No order tracking statuses found in that payload.',
    );
  }

  const ordersCol = db().collection('users').doc(uid).collection('orders');
  let updated = 0;
  const now = new Date().toISOString();

  for (const [receiptId, info] of mapped) {
    const existing = await ordersCol.where('etsyReceiptId', '==', receiptId).limit(1).get();
    if (existing.empty) continue;
    const doc = existing.docs[0]!;
    await doc.ref.set(
      {
        status: info.status,
        etsyStatusRaw: `mission_control | ${info.raw}`,
        needsMissionControl: false,
        ...(info.trackingNumber ? { trackingNumber: info.trackingNumber } : {}),
        ...(info.carrier ? { carrier: info.carrier } : {}),
        ...(info.shippingLabelId ? { etsyShippingLabelId: info.shippingLabelId } : {}),
        ...(info.shipmentId ? { etsyShipmentId: info.shipmentId } : {}),
        updatedAt: now,
      },
      { merge: true },
    );
    updated += 1;
  }

  return { updated, matched: mapped.size };
});
