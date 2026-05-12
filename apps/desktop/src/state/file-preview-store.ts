import { create } from "zustand";

import type { FilePreview } from "../types";

type FilePreviewStore = {
  filePreview: FilePreview | null;
  filePreviewError: string | null;
  filePreviewLoading: boolean;
  openPreview: () => void;
  setFilePreview: (filePreview: FilePreview | null) => void;
  setFilePreviewError: (filePreviewError: string | null) => void;
  setFilePreviewLoading: (filePreviewLoading: boolean) => void;
};

export const useFilePreviewStore = create<FilePreviewStore>((set) => ({
  filePreview: null,
  filePreviewError: null,
  filePreviewLoading: false,
  openPreview: () =>
    set({
      filePreview: null,
      filePreviewError: null,
      filePreviewLoading: true
    }),
  setFilePreview: (filePreview) => set({ filePreview }),
  setFilePreviewError: (filePreviewError) => set({ filePreviewError }),
  setFilePreviewLoading: (filePreviewLoading) => set({ filePreviewLoading })
}));
