import { create } from "zustand";

import type {
  AgentModel,
  ComposerImageAttachment,
  ComposerReviewCommentAttachment,
  IntelligenceMode,
  PermissionMode,
  SessionProvider
} from "../types";
import {
  defaultIntelligenceByProvider,
  defaultModelsByProvider
} from "../provider-registry";
import { resolveState, type StateUpdater } from "./state-utils";

type ComposerStore = {
  prompt: string;
  permission: PermissionMode;
  provider: SessionProvider;
  modelByProvider: Record<SessionProvider, AgentModel>;
  intelligenceByProvider: Record<SessionProvider, IntelligenceMode>;
  permissionOpen: boolean;
  intelligenceOpen: boolean;
  imageAttachments: ComposerImageAttachment[];
  reviewCommentAttachments: ComposerReviewCommentAttachment[];
  setPrompt: (value: StateUpdater<string>) => void;
  setPermission: (value: PermissionMode) => void;
  setProvider: (value: SessionProvider) => void;
  setModelForProvider: (provider: SessionProvider, value: AgentModel) => void;
  setActiveModel: (value: AgentModel) => void;
  setIntelligenceForProvider: (
    provider: SessionProvider,
    value: IntelligenceMode
  ) => void;
  setActiveIntelligence: (value: IntelligenceMode) => void;
  setPermissionOpen: (value: StateUpdater<boolean>) => void;
  setIntelligenceOpen: (value: StateUpdater<boolean>) => void;
  setImageAttachments: (
    value: StateUpdater<ComposerImageAttachment[]>
  ) => void;
  addImageAttachments: (attachments: ComposerImageAttachment[]) => void;
  removeImageAttachment: (id: string) => void;
  addReviewCommentAttachment: (attachment: ComposerReviewCommentAttachment) => void;
  removeReviewCommentAttachment: (id: string) => void;
  clearComposer: () => void;
};

export const useComposerStore = create<ComposerStore>((set) => ({
  prompt: "",
  permission: "Full access",
  provider: "codex",
  modelByProvider: defaultModelsByProvider,
  intelligenceByProvider: defaultIntelligenceByProvider,
  permissionOpen: false,
  intelligenceOpen: false,
  imageAttachments: [],
  reviewCommentAttachments: [],
  setPrompt: (value) =>
    set((state) => ({ prompt: resolveState(value, state.prompt) })),
  setPermission: (permission) => set({ permission }),
  setProvider: (provider) =>
    set((state) => ({
      provider,
      permissionOpen: false,
      intelligenceOpen: false,
      modelByProvider: {
        ...state.modelByProvider,
        [provider]:
          state.modelByProvider[provider] ?? defaultModelsByProvider[provider]
      },
      intelligenceByProvider: {
        ...state.intelligenceByProvider,
        [provider]:
          state.intelligenceByProvider[provider] ??
          defaultIntelligenceByProvider[provider]
      }
    })),
  setModelForProvider: (provider, model) =>
    set((state) => ({
      modelByProvider: {
        ...state.modelByProvider,
        [provider]: model
      }
    })),
  setActiveModel: (model) =>
    set((state) => ({
      modelByProvider: {
        ...state.modelByProvider,
        [state.provider]: model
      }
    })),
  setIntelligenceForProvider: (provider, intelligence) =>
    set((state) => ({
      intelligenceByProvider: {
        ...state.intelligenceByProvider,
        [provider]: intelligence
      }
    })),
  setActiveIntelligence: (intelligence) =>
    set((state) => ({
      intelligenceByProvider: {
        ...state.intelligenceByProvider,
        [state.provider]: intelligence
      }
    })),
  setPermissionOpen: (value) =>
    set((state) => ({
      permissionOpen: resolveState(value, state.permissionOpen)
    })),
  setIntelligenceOpen: (value) =>
    set((state) => ({
      intelligenceOpen: resolveState(value, state.intelligenceOpen)
    })),
  setImageAttachments: (value) =>
    set((state) => ({
      imageAttachments: resolveState(value, state.imageAttachments)
    })),
  addImageAttachments: (attachments) =>
    set((state) => ({
      imageAttachments: [...state.imageAttachments, ...attachments]
    })),
  removeImageAttachment: (id) =>
    set((state) => {
      const removed = state.imageAttachments.find(
        (attachment) => attachment.id === id
      );

      revokeAttachmentPreview(removed);

      return {
        imageAttachments: state.imageAttachments.filter(
          (attachment) => attachment.id !== id
        )
      };
    }),
  addReviewCommentAttachment: (attachment) =>
    set((state) => ({
      reviewCommentAttachments: [
        ...state.reviewCommentAttachments,
        attachment
      ]
    })),
  removeReviewCommentAttachment: (id) =>
    set((state) => ({
      reviewCommentAttachments: state.reviewCommentAttachments.filter(
        (attachment) => attachment.id !== id
      )
    })),
  clearComposer: () =>
    set((state) => {
      for (const attachment of state.imageAttachments) {
        revokeAttachmentPreview(attachment);
      }

      return { prompt: "", imageAttachments: [], reviewCommentAttachments: [] };
    })
}));

// Image previews use object URLs (created at attach time) so we avoid eagerly
// base64-encoding files just to show a thumbnail. Revoke them whenever the
// attachment leaves the composer so the blobs can be garbage collected.
function revokeAttachmentPreview(
  attachment: ComposerImageAttachment | undefined
) {
  if (attachment?.previewUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
}
