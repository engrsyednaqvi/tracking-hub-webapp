import { AlertTriangle, X } from 'lucide-react';
import { useAppErrors } from '@/context/ErrorContext';

/** Sticky left rail that always shows the full latest error text. */
export function ErrorPanel() {
  const { errors, dismissError, clearErrors } = useAppErrors();
  if (!errors.length) return null;

  return (
    <aside
      className="fixed left-3 top-20 z-50 w-[min(22rem,calc(100vw-1.5rem))] space-y-2"
      aria-live="polite"
    >
      <div className="flex items-center justify-between rounded-t-xl bg-rose-700 px-3 py-1.5 text-xs font-medium text-white">
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          Errors ({errors.length})
        </span>
        <button
          type="button"
          onClick={clearErrors}
          className="rounded px-1.5 py-0.5 hover:bg-rose-600"
        >
          Clear
        </button>
      </div>
      <ul className="max-h-[70vh] space-y-2 overflow-y-auto">
        {errors.map((entry) => (
          <li
            key={entry.id}
            className="rounded-xl border border-rose-200 bg-white/95 p-3 shadow-lg backdrop-blur"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-rose-900">{entry.title}</p>
              <button
                type="button"
                title="Dismiss"
                onClick={() => dismissError(entry.id)}
                className="shrink-0 rounded p-0.5 text-rose-400 hover:bg-rose-50 hover:text-rose-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {new Date(entry.at).toLocaleString()}
            </p>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] leading-relaxed text-rose-950">
              {entry.detail}
            </pre>
          </li>
        ))}
      </ul>
    </aside>
  );
}
