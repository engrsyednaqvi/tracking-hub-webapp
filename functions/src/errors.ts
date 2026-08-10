import { HttpsError } from 'firebase-functions/v2/https';

/** Turn any thrown value into an HttpsError so clients never only see "INTERNAL". */
export function rethrowAsHttpsError(err: unknown, fallback = 'Unexpected server error'): never {
  if (err instanceof HttpsError) throw err;

  const message =
    err instanceof Error
      ? err.message || fallback
      : typeof err === 'string'
        ? err
        : fallback;
  const stack = err instanceof Error ? err.stack : undefined;

  console.error('[callable]', message, stack ?? err);

  throw new HttpsError('internal', message.slice(0, 900), {
    fullMessage: message,
    stack: stack?.slice(0, 2000) ?? null,
  });
}

export function errorMessage(err: unknown, fallback = 'Unknown error'): string {
  if (err instanceof HttpsError) return err.message;
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return fallback;
  }
}
