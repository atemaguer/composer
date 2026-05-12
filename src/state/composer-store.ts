import { create } from "zustand";

import type {
  AgentModel,
  ComposerImageAttachment,
  IntelligenceMode,
  PermissionMode,
  SessionProvider
} from "../types";
import { resolveState, type StateUpdater } from "./state-utils";

export const defaultModelsByProvider: Record<SessionProvider, AgentModel> = {
  codex: "gpt-5.4",
  claude: "claude-sonnet-4-6",
  meta: "meta-claude-opus-codex-mini"
};

export const defaultIntelligenceByProvider: Record<
  SessionProvider,
  IntelligenceMode
> = {
  codex: "Medium",
  claude: "High",
  meta: "High"
};

type ComposerStore = {
  prompt: string;
  permission: PermissionMode;
  provider: SessionProvider;
  modelByProvider: Record<SessionProvider, AgentModel>;
  intelligenceByProvider: Record<SessionProvider, IntelligenceMode>;
  permissionOpen: boolean;
  intelligenceOpen: boolean;
  imageAttachments: ComposerImageAttachment[];
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
    set((state) => ({
      imageAttachments: state.imageAttachments.filter(
        (attachment) => attachment.id !== id
      )
    })),
  clearComposer: () => set({ prompt: "", imageAttachments: [] })
}));
