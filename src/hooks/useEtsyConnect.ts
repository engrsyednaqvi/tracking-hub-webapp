import { useCallback, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAppErrors } from '@/context/ErrorContext';
import { startEtsyOAuth } from '@/lib/functions';

/** Starts Etsy OAuth and navigates to Etsy login (full page redirect). */
export function useEtsyConnect() {
  const { user, demoMode } = useAuth();
  const { reportError, reportInfo, clearErrors } = useAppErrors();
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
    reportInfo('Opening Etsy…', 'You should be redirected to Etsy to approve access.');

    try {
      const { authUrl } = await startEtsyOAuth();
      if (!authUrl) {
        throw new Error('Etsy OAuth returned an empty authorize URL.');
      }
      // Full navigation — required for Etsy OAuth (not a popup).
      window.location.href = authUrl;
    } catch (err) {
      reportError('Connect Etsy failed', err);
      setConnecting(false);
    }
  }, [demoMode, user, reportError, reportInfo, clearErrors]);

  return { connectEtsy, connecting };
}
