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
  const data = result.data;
  if (!data || typeof data !== 'object') {
    throw new Error(`etsyOAuthStart returned unexpected data: ${JSON.stringify(data)}`);
  }
  if (!data.authUrl || typeof data.authUrl !== 'string') {
    throw new Error(
      `etsyOAuthStart missing authUrl. Got: ${JSON.stringify(data)}`,
    );
  }
  return data;
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
  shopErrors?: string[];
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
      shopErrors?: string[];
    }
  >(functions(), 'etsySync');
  const result = await callable(input ?? {});
  return result.data;
}
