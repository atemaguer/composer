import { X, XCircle } from "lucide-react";

import { cn } from "../lib/cn";
import { useToastStore } from "../state/toast-store";

export function AppToasts() {
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex w-full max-w-[640px] items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-5 shadow-lg backdrop-blur",
            toast.tone === "error"
              ? "border-red-500/40 bg-red-950/90 text-red-100"
              : "border-app-line bg-app-panel/95 text-app-text"
          )}
        >
          <XCircle
            size={16}
            className={cn(
              "mt-0.5 shrink-0",
              toast.tone === "error" ? "text-red-300" : "text-app-muted"
            )}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
            {toast.message}
          </span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss notification"
            className={cn(
              "-mr-1 -mt-0.5 shrink-0 rounded-md p-1 transition-colors",
              toast.tone === "error"
                ? "text-red-200/70 hover:bg-red-500/20 hover:text-red-100"
                : "text-app-muted hover:bg-app-hover hover:text-app-text"
            )}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
