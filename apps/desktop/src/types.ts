export type PermissionMode = "Default permissions" | "Auto-review" | "Full access";
export type IntelligenceMode = "Low" | "Medium" | "High" | "Extra High";
export type AgentModel = string;
export type NavKey = "New session";
export type SessionProvider = "codex" | "claude" | "meta";
export type ProviderFilter = "all" | SessionProvider;

export type CapabilityProvider = Extract<SessionProvider, "codex" | "claude">;
export type ComposerCapabilityKind = "plugin" | "skill";
export type ComposerCapabilityCategory = "Recommended" | "System" | "Personal";
export type ComposerCapabilitySource =
  | "codex"
  | "claude"
  | "shared"
  | "marketplace"
  | "system";
export type ComposerCapabilityComponent =
  | "skills"
  | "mcp"
  | "hooks"
  | "apps"
  | "agents"
  | "commands"
  | "lsp"
  | "monitors";

export type ComposerCapability = {
  id: string;
  kind: ComposerCapabilityKind;
  name: string;
  description: string;
  category: ComposerCapabilityCategory;
  source: ComposerCapabilitySource;
  providers: CapabilityProvider[];
  path?: string;
  pluginName?: string;
  iconKey?: string;
  installed: boolean;
  enabled: boolean;
  recommended?: boolean;
  components?: ComposerCapabilityComponent[];
};

export type ComposerCapabilityCatalog = {
  generatedAt: string;
  items: ComposerCapability[];
};

export type ProviderSessionState = {
  sessionId?: string;
  lastContextVersion?: number;
};
export type SessionHandoffSummary = {
  id: string;
  provider: SessionProvider;
  contextVersion: number;
  createdAt: string;
  summary: string;
  filesChanged: string[];
  commandsRun: string[];
  testsRun: string[];
};
export type SessionCompactionSummary = {
  id: string;
  provider: SessionProvider;
  contextVersion: number;
  createdAt: string;
  trigger?: "manual" | "auto";
  summary: string;
  preTokens?: number;
  postTokens?: number;
};
export type AgentSessionRuntimeStatus =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "error";

export type ComposerImageAttachment = {
  id: string;
  name: string;
  mediaType: string;
  previewUrl: string;
  dataUrl?: string;
  path?: string;
};

export type AgentImageAttachment = {
  name: string;
  mediaType: string;
  dataUrl?: string;
  path?: string;
};

export type DiffRowData = [line: string, tone: string, code: string];

export type ProjectThread = {
  id: string;
  name: string;
  age: string;
  active?: boolean;
  provider?: SessionProvider;
  model?: string;
  cwd?: string;
};

export type Project = {
  id?: string;
  name: string;
  cwd?: string;
  provider?: SessionProvider;
  threads: ProjectThread[];
};

export type ThreadViewMode = "sidebar" | "tabs";

export type ToolStatus = "running" | "completed" | "failed" | "cancelled";

export type ToolDetail = {
  id: string;
  label: string;
  tone?: "default" | "command" | "error" | "summary" | "output";
  kind?: "call" | "output" | "summary";
  toolName?: string;
  action?: "read" | "edit" | "search" | "command" | "generate" | "other";
  args?: Record<string, string>;
  command?: string;
  output?: string;
  path?: string;
  status?: ToolStatus;
};

export type FileChangeRow = {
  path: string;
  additions: number;
  deletions: number;
};

export type FileChangeSummaryItem = {
  id: string;
  type: "file_change_summary";
  summary: string;
  additions: number;
  deletions: number;
  files: FileChangeRow[];
  defaultOpen?: boolean;
};

export type ConversationAttachment = {
  id: string;
  type: "file" | "source-document";
  filename?: string;
  title?: string;
  mediaType?: string;
  url?: string;
};

export type ConversationItem =
  | {
      id: string;
      type: "user_message";
      body: string;
      timestamp?: string;
      steered?: boolean;
    }
  | {
      id: string;
      type: "assistant_message";
      body: string;
      attachments?: FileChangeSummaryItem[];
    }
  | {
      id: string;
      type: "turn_status";
      label: string;
    }
  | {
      id: string;
      type: "tool_group";
      summary: string;
      details: ToolDetail[];
      defaultOpen?: boolean;
    }
  | {
      id: string;
      type: "running_tool";
      label: string;
      status: ToolStatus;
      details?: ToolDetail[];
    }
  | {
      id: string;
      type: "attachment_group";
      attachments: ConversationAttachment[];
      timestamp?: string;
    }
  | FileChangeSummaryItem
  | {
      id: string;
      type: "hook_event";
      label: string;
    }
  | {
      id: string;
      type: "notice";
      label: string;
    }
  | {
      id: string;
      type: "jump_marker";
      label?: string;
    };

export type PendingConversationItem = Extract<
  ConversationItem,
  { type: "running_tool" }
>;

export type SessionContent = {
  id: string;
  provider: SessionProvider;
  providerSessionId?: string;
  providerSessions?: Partial<Record<SessionProvider, ProviderSessionState>>;
  contextVersion?: number;
  lastProvider?: SessionProvider;
  handoffSummaries?: SessionHandoffSummary[];
  compactionSummaries?: SessionCompactionSummary[];
  runtimeStatus?: AgentSessionRuntimeStatus;
  title: string;
  updatedAt?: string;
  cwd?: string;
  model?: string;
  items: ConversationItem[];
  pendingItems: PendingConversationItem[];
};

export type SessionSnapshot = {
  projects: Project[];
  sessions: Record<string, SessionContent>;
};

export type ApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export type ApprovalRequest = {
  id: string;
  provider: SessionProvider;
  sessionId: string;
  turnId?: string;
  kind: "command" | "file_change" | "permission" | "question" | "tool";
  title: string;
  details?: Record<string, string>;
  availableDecisions: ApprovalDecision[];
};

export type AgentSettings = {
  permissionMode: PermissionMode;
  intelligence: IntelligenceMode;
  model?: AgentModel;
};

export type LiveAgentEvent =
  | { id: string; type: "sessions.snapshot"; snapshot: SessionSnapshot }
  | { id: string; type: "session.started"; session: SessionContent }
  | { id: string; type: "session.updated"; session: SessionContent }
  | {
      id: string;
      type: "turn.started";
      sessionId: string;
      turnId: string;
      label?: string;
    }
  | {
      id: string;
      type: "message.delta";
      sessionId: string;
      messageId: string;
      delta: string;
    }
  | {
      id: string;
      type: "message.completed";
      sessionId: string;
      messageId: string;
      body?: string;
    }
  | {
      id: string;
      type: "tool.started";
      sessionId: string;
      toolId: string;
      label: string;
      detail?: ToolDetail;
    }
  | {
      id: string;
      type: "tool.delta";
      sessionId: string;
      toolId: string;
      delta: string;
    }
  | {
      id: string;
      type: "tool.completed";
      sessionId: string;
      toolId: string;
      detail?: ToolDetail;
    }
  | { id: string; type: "approval.requested"; approval: ApprovalRequest }
  | { id: string; type: "approval.resolved"; approvalId: string }
  | {
      id: string;
      type: "turn.completed";
      sessionId: string;
      turnId?: string;
      status: AgentSessionRuntimeStatus;
    }
  | { id: string; type: "error"; sessionId?: string; message: string };

export type ComposerChatDataTypes = {
  composer: LiveAgentEvent;
};

export type FilePreview = {
  path: string;
  content: string;
  size: number;
  truncated: boolean;
  mtimeMs: number;
};
