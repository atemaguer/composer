import type {
  ReviewDiffLine as SharedReviewDiffLine,
  SessionProvider as SharedSessionProvider
} from "@composer/client";

export type {
  AgentImageAttachment,
  AgentModel,
  AgentSessionRuntimeStatus,
  AgentSettings,
  ApprovalDecision,
  ApprovalRequest,
  CapabilityProvider,
  ComposerCapability,
  ComposerCapabilityCatalog,
  ComposerCapabilityCategory,
  ComposerCapabilityComponent,
  ComposerCapabilityKind,
  ComposerCapabilitySource,
  ComposerChatDataTypes,
  ConversationAttachment,
  ConversationItem,
  DelegateSessionProvider,
  DiffRowData,
  FileChangeRow,
  FileChangeSummaryItem,
  IntelligenceMode,
  LiveAgentEvent,
  PendingConversationItem,
  PermissionMode,
  Project,
  ProjectThread,
  ProviderSessionState,
  QueuedUserMessage,
  QuestionAnswer,
  QuestionItem,
  QuestionOption,
  QuestionRequest,
  ReviewBranchComparison,
  ReviewBranchList,
  ReviewBranchRef,
  ReviewDiff,
  ReviewDiffFile,
  ReviewDiffHunk,
  ReviewDiffLine,
  ReviewDiffScope,
  SessionCompactionSummary,
  SessionContent,
  SessionHandoffSummary,
  SessionProvider,
  SessionRenderMode,
  SessionSnapshot,
  ToolDetail,
  ToolStatus
} from "@composer/client";

export type NavKey = "New session";
export type ProviderFilter = "all" | SharedSessionProvider;
export type ThreadViewMode = "sidebar" | "tabs";

export type ComposerImageAttachment = {
  id: string;
  name: string;
  mediaType: string;
  previewUrl: string;
  dataUrl?: string;
  path?: string;
};

export type ComposerReviewCommentAttachment = {
  id: string;
  filePath: string;
  lineNumber: number;
  side: "L" | "R";
  body: string;
  lineContent?: string;
  lineKind?: SharedReviewDiffLine["kind"];
};

export type FilePreview = {
  path: string;
  content: string;
  size: number;
  truncated: boolean;
  mtimeMs: number;
};

export type WorkspaceFileEntry = {
  path: string;
  absolutePath: string;
  size: number;
  mtimeMs: number;
};

export type InspectorPanelTab = "review" | "terminal" | "file-preview";
