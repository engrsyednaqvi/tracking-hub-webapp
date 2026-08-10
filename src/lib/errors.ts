/** Flatten Firebase callable / generic errors into a full readable string. */
export function formatFirebaseError(err: unknown): string {
  if (err == null) return 'Unknown error';
  if (typeof err === 'string') return err;

  const e = err as {
    name?: string;
    code?: string;
    message?: string;
    details?: unknown;
    customData?: unknown;
    stack?: string;
    cause?: unknown;
  };

  const lines: string[] = [];
  if (e.code) lines.push(`code: ${e.code}`);
  if (e.name && e.name !== 'Error' && e.name !== 'FirebaseError') {
    lines.push(`name: ${e.name}`);
  }
  if (e.message) lines.push(e.message);

  if (e.details != null) {
    lines.push(
      `details: ${
        typeof e.details === 'string' ? e.details : safeJson(e.details)
      }`,
    );
  }
  if (e.customData != null) {
    lines.push(`customData: ${safeJson(e.customData)}`);
  }
  if (e.cause != null) {
    lines.push(`cause: ${formatFirebaseError(e.cause)}`);
  }

  if (!lines.length) {
    try {
      return String(err);
    } catch {
      return 'Unknown error';
    }
  }

  return lines.join('\n');
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
