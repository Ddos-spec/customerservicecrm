import { useCallback, useEffect, useState } from 'react';

export interface ConfirmOptions {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the dialog as a destructive action (red accent) instead of a neutral one. */
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

let pushState: ((state: ConfirmState | null) => void) | null = null;

/**
 * Imperative replacement for window.confirm(). Resolves to true/false like
 * the native dialog, but renders as a themed modal via ConfirmDialogHost.
 * Falls back to window.confirm if the host hasn't mounted yet so a call
 * site never silently no-ops.
 */
export function confirmDialog(options: ConfirmOptions | string): Promise<boolean> {
  const opts: ConfirmOptions = typeof options === 'string' ? { description: options } : options;
  return new Promise((resolve) => {
    if (!pushState) {
      resolve(window.confirm(opts.description));
      return;
    }
    pushState({ ...opts, resolve });
  });
}

export function ConfirmDialogHost() {
  const [state, setState] = useState<ConfirmState | null>(null);

  useEffect(() => {
    pushState = setState;
    return () => {
      pushState = null;
    };
  }, []);

  const settle = useCallback((result: boolean) => {
    setState((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') settle(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [state, settle]);

  if (!state) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={() => settle(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={state.title || 'Konfirmasi'}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="p-6">
          <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${state.danger ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-300'}`}>
            {state.danger ? 'Tindakan berisiko' : 'Konfirmasi'}
          </p>
          <h2 className="mt-2 text-lg font-black text-gray-900 dark:text-white">{state.title || 'Yakin lanjut?'}</h2>
          <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">{state.description}</p>
        </div>
        <div className="flex gap-3 border-t border-gray-100 px-6 py-4 dark:border-slate-800">
          <button
            type="button"
            onClick={() => settle(false)}
            className="flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-gray-600 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-gray-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-300 dark:hover:bg-slate-800"
          >
            {state.cancelLabel || 'Batal'}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => settle(true)}
            className={`flex-1 rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white shadow-lg transition-colors focus:outline-none focus:ring-4 ${
              state.danger
                ? 'bg-rose-600 shadow-rose-200 hover:bg-rose-700 focus:ring-rose-500/25 dark:shadow-rose-950/40'
                : 'bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700 focus:ring-emerald-500/25 dark:shadow-emerald-950/40'
            }`}
          >
            {state.confirmLabel || 'Ya, lanjutkan'}
          </button>
        </div>
      </div>
    </div>
  );
}
