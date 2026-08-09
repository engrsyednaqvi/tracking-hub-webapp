import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, isFirebaseConfigured } from '@/lib/firebase';

function functions() {
  if (!isFirebaseConfigured || !app) {
    throw new Error('Firebase is not configured');
  }
  return getFunctions(app, 'us-central1');
}

export async function startEtsyOAuth(): Promise<{ authUrl: string; redirectUri: string }> {
  const callable = httpsCallable<unknown, { authUrl: string; redirectUri: string }>(
    functions(),
    'etsyOAuthStart',
  );
  const result = await callable({});
  return result.data;
}

export async function syncEtsyOrders(input?: {
  shopId?: string;
  syncDays?: number;
}): Promise<{
  created: number;
  updated: number;
  shops: number;
  syncDays: number;
  uspsEnriched?: number;
  uspsSkipped?: number;
  uspsError?: string | null;
}> {
  const callable = httpsCallable<
    { shopId?: string; syncDays?: number },
    {
      created: number;
      updated: number;
      shops: number;
      syncDays: number;
      uspsEnriched?: number;
      uspsSkipped?: number;
      uspsError?: string | null;
    }
  >(functions(), 'etsySync');
  const result = await callable(input ?? {});
  return result.data;
}
