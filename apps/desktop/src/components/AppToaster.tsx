import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Info, X, XCircle } from "lucide-react";
import toast, { Toaster, useToasterStore } from "react-hot-toast";

import { cn } from "../lib/cn";
import { formatActionError } from "../state/toast-utils";

type AppToastTone = "error" | "info";

const MAX_VISIBLE_TOASTS = 4;
const TOASTER_CONTAINER_STYLE = {
  top: 18,
  left: 16,
  right: 16,
  zIndex: 9999
} as const;
const TOASTER_OPTIONS = {
  duration: 4000,
  removeDelay: 200
} as const;

export function AppToaster() {
  useToastLimit();

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <Toaster
      position="top-center"
      gutter={10}
      containerClassName="app-no-drag"
      containerStyle={TOASTER_CONTAINER_STYLE}
      toastOptions={TOASTER_OPTIONS}
    />,
    document.body
  );
}

export function pushAppToast({
  message,
  tone = "error",
  id
}: {
  message: string;
  tone?: AppToastTone;
  id?: string;
}): string {
  const toastId = id ?? toastIdFor(tone, message);

  return toast.custom(
    (currentToast) => (
      <AppToastCard
        id={currentToast.id}
        message={message}
        tone={tone}
        visible={currentToast.visible}
      />
    ),
    {
      id: toastId,
      duration: tone === "error" ? 9000 : 4000,
      removeDelay: 200,
      ariaProps: {
        role: tone === "error" ? "alert" : "status",
        "aria-live": tone === "error" ? "assertive" : "polite"
      }
    }
  );
}

/** Push an error toast from anywhere (including non-React callers). */
export function pushAppError(message: string): string {
  return pushAppToast({ message, tone: "error" });
}

/** Surface a failed action as an error toast, formatting the underlying error. */
export function pushActionError(prefix: string, error: unknown): string {
  return pushAppError(formatActionError(prefix, error));
}

function AppToastCard({
  id,
  message,
  tone,
  visible
}: {
  id: string;
  message: string;
  tone: AppToastTone;
  visible: boolean;
}) {
  const Icon = tone === "error" ? XCircle : Info;

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={cn(
        "flex w-[min(calc(100vw-48px),640px)] items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-5 shadow-lg backdrop-blur transition-all duration-150",
        visible ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
        tone === "error"
          ? "border-red-500/40 bg-red-950/90 text-red-100"
          : "border-app-line bg-app-panel/95 text-app-text"
      )}
    >
      <Icon
        size={16}
        className={cn(
          "mt-0.5 shrink-0",
          tone === "error" ? "text-red-300" : "text-app-muted"
        )}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
        {message}
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          toast.dismiss(id);
        }}
        aria-label="Dismiss notification"
        className={cn(
          "-mr-1 -mt-0.5 shrink-0 rounded-md p-1 transition-colors",
          tone === "error"
            ? "text-red-200/70 hover:bg-red-500/20 hover:text-red-100"
            : "text-app-muted hover:bg-app-hover hover:text-app-text"
        )}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function useToastLimit() {
  const { toasts } = useToasterStore();

  useEffect(() => {
    const visibleToasts = toasts.filter(
      (currentToast) => currentToast.visible && !currentToast.dismissed
    );

    for (const currentToast of visibleToasts.slice(MAX_VISIBLE_TOASTS)) {
      toast.dismiss(currentToast.id);
    }
  }, [toasts]);
}

function toastIdFor(tone: AppToastTone, message: string) {
  let hash = 0;
  const key = `${tone}:${message}`;

  for (let index = 0; index < key.length; index += 1) {
    hash = (Math.imul(31, hash) + key.charCodeAt(index)) | 0;
  }

  return `app-toast-${hash >>> 0}`;
}
