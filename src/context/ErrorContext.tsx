import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { formatFirebaseError } from '@/lib/errors';

export type AppNoticeKind = 'error' | 'info';

export interface AppNotice {
  id: string;
  kind: AppNoticeKind;
  title: string;
  detail: string;
  at: string;
}

interface ErrorContextValue {
  notices: AppNotice[];
  /** @deprecated use notices */
  errors: AppNotice[];
  /** Manual fallback when browser blocks OAuth redirect. */
  etsyAuthUrl: string | null;
  setEtsyAuthUrl: (url: string | null) => void;
  reportError: (title: string, err: unknown) => void;
  reportInfo: (title: string, detail: string) => void;
  dismissNotice: (id: string) => void;
  dismissError: (id: string) => void;
  clearErrors: () => void;
}

const ErrorContext = createContext<ErrorContextValue | null>(null);

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [etsyAuthUrl, setEtsyAuthUrl] = useState<string | null>(null);

  const push = useCallback((kind: AppNoticeKind, title: string, detail: string) => {
    const entry: AppNotice = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      kind,
      title,
      detail,
      at: new Date().toISOString(),
    };
    if (kind === 'error') console.error(`[${title}]`, detail);
    setNotices((prev) => [entry, ...prev].slice(0, 10));
  }, []);

  const reportError = useCallback(
    (title: string, err: unknown) => {
      push('error', title, formatFirebaseError(err));
    },
    [push],
  );

  const reportInfo = useCallback(
    (title: string, detail: string) => {
      push('info', title, detail);
    },
    [push],
  );

  const dismissNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clearErrors = useCallback(() => setNotices([]), []);

  const value = useMemo(
    () => ({
      notices,
      errors: notices.filter((n) => n.kind === 'error'),
      etsyAuthUrl,
      setEtsyAuthUrl,
      reportError,
      reportInfo,
      dismissNotice,
      dismissError: dismissNotice,
      clearErrors,
    }),
    [notices, etsyAuthUrl, reportError, reportInfo, dismissNotice, clearErrors],
  );

  return <ErrorContext.Provider value={value}>{children}</ErrorContext.Provider>;
}

export function useAppErrors(): ErrorContextValue {
  const ctx = useContext(ErrorContext);
  if (!ctx) {
    throw new Error('useAppErrors must be used within ErrorProvider');
  }
  return ctx;
}
