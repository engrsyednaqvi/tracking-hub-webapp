import { useCallback, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAppErrors } from '@/context/ErrorContext';
import { startEtsyOAuth } from '@/lib/functions';

export type EtsyConnectInput = {
  keystring?: string;
  sharedSecret?: string;
  /** Reuse saved Seller app keys for this shop (after first successful connect). */
  shopId?: string;
};

function assertEtsyOAuthUrl(url: string): string {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`OAuth URL is not a valid URL: ${trimmed || '(empty)'}`);
  }
  if (parsed.hostname !== 'www.etsy.com' && parsed.hostname !== 'etsy.com') {
    throw new Error(
      `OAuth URL must be on etsy.com (got ${parsed.hostname}). Full URL: ${trimmed}`,
    );
  }
  if (!parsed.pathname.includes('/oauth')) {
    throw new Error(`OAuth URL missing /oauth path: ${trimmed}`);
  }
  return trimmed;
}

/** Starts Etsy OAuth with per-shop Seller app keys. */
export function useEtsyConnect() {
  const { user, demoMode } = useAuth();
  const { reportError, reportInfo, clearErrors, setEtsyAuthUrl } = useAppErrors();
  const [connecting, setConnecting] = useState(false);

  const connectEtsy = useCallback(
    async (input: EtsyConnectInput = {}) => {
      if (demoMode) {
        reportError('Connect Etsy failed', 'Sign in with a real account (not demo mode).');
        return;
      }
      if (!user) {
        reportError('Connect Etsy failed', 'Sign in first.');
        return;
      }

      const keystring = input.keystring?.trim() ?? '';
      const sharedSecret = input.sharedSecret?.trim() ?? '';
      const shopId = input.shopId?.trim() ?? '';

      if (!shopId && (!keystring || !sharedSecret)) {
        reportError(
          'Connect Etsy failed',
          'Paste that Etsy account’s Seller app keystring and shared secret, then Connect. Each shop uses its own Seller app.',
        );
        return;
      }

      setConnecting(true);
      clearErrors();
      setEtsyAuthUrl(null);

      const etsyTab = window.open('about:blank', 'etsy-oauth');

      try {
        reportInfo(
          'Opening Etsy…',
          shopId
            ? 'Using saved Seller app keys for this shop…'
            : 'Using the keystring/secret you entered…',
        );
        const data = await startEtsyOAuth({
          ...(keystring && sharedSecret ? { keystring, sharedSecret } : {}),
          ...(shopId ? { shopId } : {}),
        });
        const authUrl = assertEtsyOAuthUrl(String(data?.authUrl ?? ''));

        setEtsyAuthUrl(authUrl);
        reportInfo(
          'Continue on Etsy',
          'Log into the matching seller account and approve. If no tab opened, use “Open Etsy login”.',
        );

        if (etsyTab && !etsyTab.closed) {
          etsyTab.location.href = authUrl;
          etsyTab.focus();
        } else {
          window.location.assign(authUrl);
        }
      } catch (err) {
        try {
          etsyTab?.close();
        } catch {
          /* ignore */
        }
        reportError('Connect Etsy failed', err);
      } finally {
        setConnecting(false);
      }
    },
    [demoMode, user, reportError, reportInfo, clearErrors, setEtsyAuthUrl],
  );

  return { connectEtsy, connecting };
}
