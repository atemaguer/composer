import { create } from "zustand";

import {
  addToast,
  formatActionError,
  type AppToast,
  type AppToastTone
} from "./toast-utils";

export type ToastStore = {
  toasts: AppToast[];
  pushToast: (toast: { message: string; tone?: AppToastTone; id?: string }) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
};

let toastCounter = 0;

function nextToastId() {
  toastCounter += 1;
  return `toast-${toastCounter}`;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  pushToast: ({ message, tone = "error", id }) => {
    const toastId = id ?? nextToastId();

    set((state) => ({
      toasts: addToast(state.toasts, { id: toastId, message, tone })
    }));

    return toastId;
  },
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id)
    })),
  clearToasts: () => set({ toasts: [] })
}));

/** Push an error toast from anywhere (including non-React callers). */
export function pushAppError(message: string): string {
  return useToastStore.getState().pushToast({ message, tone: "error" });
}

/** Surface a failed action as an error toast, formatting the underlying error. */
export function pushActionError(prefix: string, error: unknown): string {
  return pushAppError(formatActionError(prefix, error));
}
