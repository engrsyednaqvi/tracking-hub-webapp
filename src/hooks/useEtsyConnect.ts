import { useCallback, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAppErrors } from '@/context/ErrorContext';
import { startEtsyOAuth } from '@/lib/functions';

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

/** Starts Etsy OAuth. Opens Etsy in a new tab (async-safe), with a clickable fallback. */
export function useEtsyConnect() {
  const { user, demoMode } = useAuth();
  const { reportError, reportInfo, clearErrors, setEtsyAuthUrl } = useAppErrors();
  const [connecting, setConnecting] = useState(false);

  const connectEtsy = useCallback(async () => {
    if (demoMode) {
      reportError('Connect Etsy failed', 'Sign in with a real account (not demo mode).');
      return;
    }
    if (!user) {
      reportError('Connect Etsy failed', 'Sign in first.');
      return;
    }

    setConnecting(true);
    clearErrors();
    setEtsyAuthUrl(null);

    // Open the tab during the user click — after await, browsers often block navigation.
    const etsyTab = window.open('about:blank', 'etsy-oauth');

    try {
      reportInfo('Opening Etsy…', 'Requesting authorize URL from the server…');
      const data = await startEtsyOAuth();
      const authUrl = assertEtsyOAuthUrl(String(data?.authUrl ?? ''));

      setEtsyAuthUrl(authUrl);
      reportInfo(
        'Continue on Etsy',
        'If no Etsy tab opened, use the green “Open Etsy login” button below.',
      );

      if (etsyTab && !etsyTab.closed) {
        etsyTab.location.href = authUrl;
        etsyTab.focus();
      } else {
        // Popup blocked — same-tab navigation as last resort.
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
  }, [demoMode, user, reportError, reportInfo, clearErrors, setEtsyAuthUrl]);

  return { connectEtsy, connecting };
}
