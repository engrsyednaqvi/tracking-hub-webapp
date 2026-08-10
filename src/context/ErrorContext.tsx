import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { formatFirebaseError } from '@/lib/errors';

export interface AppErrorEntry {
  id: string;
  title: string;
  detail: string;
  at: string;
}

interface ErrorContextValue {
  errors: AppErrorEntry[];
  reportError: (title: string, err: unknown) => void;
  dismissError: (id: string) => void;
  clearErrors: () => void;
}

const ErrorContext = createContext<ErrorContextValue | null>(null);

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [errors, setErrors] = useState<AppErrorEntry[]>([]);

  const reportError = useCallback((title: string, err: unknown) => {
    const detail = formatFirebaseError(err);
    const entry: AppErrorEntry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      detail,
      at: new Date().toISOString(),
    };
    console.error(`[${title}]`, err, detail);
    setErrors((prev) => [entry, ...prev].slice(0, 8));
  }, []);

  const dismissError = useCallback((id: string) => {
    setErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clearErrors = useCallback(() => setErrors([]), []);

  const value = useMemo(
    () => ({ errors, reportError, dismissError, clearErrors }),
    [errors, reportError, dismissError, clearErrors],
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
