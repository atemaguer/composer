export type PermissionMode = "Default permissions" | "Auto-review" | "Full access";
export type IntelligenceMode = "Low" | "Medium" | "High" | "Extra High";
export type AgentModel = string;
export type SessionProvider = "codex" | "claude" | "meta";
export type DelegateSessionProvider = Extract<SessionProvider, "codex" | "claude">;

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
  cwd?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  originalCwd?: string;
  originalBranch?: string;
  originalHead?: string;
  lastContextVersion?: number;
};
export type SessionRenderMode = "single" | "hybrid";
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
  source?:
    | "claude-post-compact"
    | "codex-handoff-turn"
    | "deterministic-fallback"
    | "codex-native-opaque";
  summary: string;
  preTokens?: number;
  postTokens?: number;
};
export type AgentSessionRuntimeStatus =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "error";

export type AgentImageAttachment = {
  name: string;
  mediaType: string;
  dataUrl?: string;
  path?: string;
};

export type DiffRowData = [line: string, tone: string, code: string];

export type ReviewDiffLine = {
  kind: "context" | "add" | "delete";
  oldLine: number | null;
  newLine: number | null;
  content: string;
};

export type ReviewDiffHunk = {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: ReviewDiffLine[];
};

export type ReviewDiffFile = {
  path: string;
  oldPath?: string;
  status?: "added" | "deleted" | "modified" | "renamed" | "binary";
  additions: number;
  deletions: number;
  hunks: ReviewDiffHunk[];
  isBinary?: boolean;
};

export type ReviewDiff = {
  cwd: string;
  generatedAt: string;
  files: ReviewDiffFile[];
  additions: number;
  deletions: number;
  raw: string;
  comparison?: ReviewBranchComparison;
  gitAvailable?: boolean;
};

export type ReviewDiffScope =
  | "last-turn"
  | "unstaged"
  | "staged"
  | "commit"
  | "branch";

export type ReviewBranchComparison = {
  headRef: string;
  baseRef: string;
};

export type ReviewBranchRef = {
  name: string;
  kind: "local" | "remote";
};

export type ReviewBranchList = {
  currentRef: string;
  defaultBaseRef: string | null;
  branches: ReviewBranchRef[];
  gitAvailable?: boolean;
  uncommittedCount?: number;
};

export type ProjectThread = {
  id: string;
  name: string;
  age: string;
  active?: boolean;
  provider?: SessionProvider;
  model?: string;
  cwd?: string;
  parentSessionId?: string;
  subagent?: SubagentMetadata;
  children?: ProjectThread[];
};

export type SubagentMetadata = {
  id?: string;
  nickname?: string;
  role?: string;
  type?: string;
  depth?: number;
};

export type Project = {
  id?: string;
  name: string;
  cwd?: string;
  provider?: SessionProvider;
  threads: ProjectThread[];
};

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
  reviewFiles?: ReviewDiffFile[];
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
      provider?: SessionProvider;
      layoutGroupId?: string;
      layoutTitle?: string;
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
      provider?: SessionProvider;
      layoutGroupId?: string;
      layoutTitle?: string;
      defaultOpen?: boolean;
      status?: ToolStatus;
    }
  | {
      // A provider reasoning/thinking step shown between turns and tool calls.
      // Rendered collapsed; it also separates otherwise-consecutive tool calls
      // into distinct groups (the reasoning marks a logical boundary).
      id: string;
      type: "reasoning";
      body: string;
      provider?: SessionProvider;
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
    }
  | {
      id: string;
      type: "parallel_thread_group";
      columns: Array<{
        provider: SessionProvider;
        title: string;
        items: ConversationItem[];
      }>;
      prompt?: string;
    };

export type PendingConversationItem = Extract<
  ConversationItem,
  { type: "running_tool" }
>;

export type SessionContent = {
  id: string;
  provider: SessionProvider;
  providerSessionId?: string;
  nativeWorktreeName?: string;
  providerSessions?: Partial<Record<SessionProvider, ProviderSessionState>>;
  renderMode?: SessionRenderMode;
  parentSessionId?: string;
  subagent?: SubagentMetadata;
  contextVersion?: number;
  lastProvider?: SessionProvider;
  parallelAdoptedProvider?: DelegateSessionProvider;
  handoffSummaries?: SessionHandoffSummary[];
  compactionSummaries?: SessionCompactionSummary[];
  runtimeStatus?: AgentSessionRuntimeStatus;
  contentLoaded?: boolean;
  title: string;
  updatedAt?: string;
  cwd?: string;
  displayCwd?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  originalCwd?: string;
  originalBranch?: string;
  originalHead?: string;
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
  composeAgents?: Partial<
    Record<
      DelegateSessionProvider,
      {
        model?: AgentModel;
        intelligence?: IntelligenceMode;
      }
    >
  >;
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
      provider?: SessionProvider;
      layoutGroupId?: string;
      layoutTitle?: string;
    }
  | {
      id: string;
      type: "message.completed";
      sessionId: string;
      messageId: string;
      body?: string;
      provider?: SessionProvider;
      layoutGroupId?: string;
      layoutTitle?: string;
    }
  | {
      id: string;
      type: "tool.started";
      sessionId: string;
      toolId: string;
      label: string;
      provider?: SessionProvider;
      layoutGroupId?: string;
      layoutTitle?: string;
      detail?: ToolDetail;
    }
  | {
      id: string;
      type: "tool.delta";
      sessionId: string;
      toolId: string;
      provider?: SessionProvider;
      layoutGroupId?: string;
      layoutTitle?: string;
      delta: string;
    }
  | {
      id: string;
      type: "tool.completed";
      sessionId: string;
      toolId: string;
      provider?: SessionProvider;
      layoutGroupId?: string;
      layoutTitle?: string;
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
  | {
      // Lightweight metadata/status patch for an existing session. Carries only
      // changed scalar fields (and optionally appended items) instead of the
      // entire SessionContent. Reserve `session.updated` for structural rebuilds
      // (new user message turn, parallel adoption, handoff/compaction).
      id: string;
      type: "session.patch";
      sessionId: string;
      runtimeStatus?: AgentSessionRuntimeStatus;
      updatedAt?: string;
      title?: string;
      cwd?: string;
      displayCwd?: string;
      worktreePath?: string;
      worktreeBranch?: string;
      model?: string;
      lastProvider?: SessionProvider;
      contextVersion?: number;
      providerSessions?: Partial<Record<SessionProvider, ProviderSessionState>>;
      // Items to append to the session timeline (e.g. a just-sent user message).
      // Items whose id already exists are replaced in place, not duplicated.
      appendedItems?: ConversationItem[];
    }
  | { id: string; type: "session.removed"; sessionId: string }
  | {
      id: string;
      type: "error";
      sessionId?: string;
      requestId?: string;
      message: string;
    };

export type ComposerChatDataTypes = {
  composer: LiveAgentEvent;
};
