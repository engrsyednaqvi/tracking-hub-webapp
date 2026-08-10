import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { errorMessage } from '../errors';
import { refreshAccessToken } from './api';

const adminApp = getApps()[0] ?? initializeApp();

function db() {
  return getFirestore(adminApp);
}

export type OAuthAppCreds = { keystring: string; sharedSecret: string };

export async function markShopNeedsReconnect(
  uid: string,
  shopDocId: string,
  reason: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db().collection('users').doc(uid).collection('shops').doc(shopDocId).set(
    {
      connected: false,
      reconnectRequired: true,
      reconnectReason: reason.slice(0, 400),
      updatedAt: now,
    },
    { merge: true },
  );
  // Keep keystring/sharedSecret so Reconnect can reuse that shop’s Seller app.
  await db()
    .collection('users')
    .doc(uid)
    .collection('etsyCredentials')
    .doc(shopDocId)
    .set(
      {
        accessToken: '',
        refreshToken: '',
        expiresAt: 0,
        updatedAt: now,
      },
      { merge: true },
    );
}

function isInvalidEtsyGrant(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes('invalid_grant') ||
    msg.includes('client_id is invalid') ||
    msg.includes('invalid_client')
  );
}

export async function ensureAccessToken(
  uid: string,
  shopDocId: string,
  globalFallback: OAuthAppCreds,
): Promise<{
  accessToken: string;
  etsyShopId: number;
  keystring: string;
  sharedSecret: string;
}> {
  const credRef = db()
    .collection('users')
    .doc(uid)
    .collection('etsyCredentials')
    .doc(shopDocId);
  const snap = await credRef.get();
  if (!snap.exists) {
    throw new HttpsError('failed-precondition', 'Shop is not connected to Etsy.');
  }
  const cred = snap.data() as {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    etsyShopId: number;
    etsyClientId?: string;
    keystring?: string;
    sharedSecret?: string;
  };

  const keystring = String(cred.keystring || globalFallback.keystring).trim();
  const sharedSecret = String(cred.sharedSecret || globalFallback.sharedSecret).trim();
  if (!keystring || !sharedSecret) {
    const reason =
      'Missing Etsy Seller app keys for this shop. Paste that account’s keystring + secret and Connect.';
    await markShopNeedsReconnect(uid, shopDocId, reason);
    throw new HttpsError('failed-precondition', reason);
  }

  // Tokens are bound to the Etsy app (keystring) that issued them.
  if (cred.etsyClientId && cred.etsyClientId !== keystring) {
    const reason =
      'Saved tokens do not match this shop’s Etsy app keys. Reconnect with the correct Seller app.';
    await markShopNeedsReconnect(uid, shopDocId, reason);
    throw new HttpsError('failed-precondition', reason);
  }

  if (cred.accessToken && cred.expiresAt > Date.now() + 60_000) {
    return {
      accessToken: cred.accessToken,
      etsyShopId: Number(cred.etsyShopId),
      keystring,
      sharedSecret,
    };
  }

  if (!cred.refreshToken) {
    const reason = 'Etsy refresh token missing — reconnect this shop (Connect Etsy).';
    await markShopNeedsReconnect(uid, shopDocId, reason);
    throw new HttpsError('failed-precondition', reason);
  }

  let token: Awaited<ReturnType<typeof refreshAccessToken>>;
  try {
    token = await refreshAccessToken({
      keystring,
      sharedSecret,
      refreshToken: cred.refreshToken,
    });
  } catch (err) {
    const detail = errorMessage(err);
    const reason = isInvalidEtsyGrant(err)
      ? `Etsy rejected this shop’s tokens. Reconnect with that account’s Seller app keys. ${detail}`
      : `Etsy token refresh failed — reconnect this shop. ${detail}`;
    await markShopNeedsReconnect(uid, shopDocId, reason);
    throw new HttpsError('failed-precondition', reason);
  }

  const expiresAt = Date.now() + Math.max(60, token.expires_in - 60) * 1000;
  await credRef.set(
    {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
      etsyClientId: keystring,
      keystring,
      sharedSecret,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  return {
    accessToken: token.access_token,
    etsyShopId: Number(cred.etsyShopId),
    keystring,
    sharedSecret,
  };
}
