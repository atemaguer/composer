import type {
  ConversationItem,
  DiffRowData,
  PendingConversationItem,
  Project,
  SessionSnapshot
} from "../types";

export const projects: Project[] = [
  {
    name: "composer-ade",
    threads: [
      {
        id: "implement-workspace-indexing",
        name: "Implement workspace indexing",
        age: "now",
        active: true,
        provider: "codex"
      },
      {
        id: "design-usage-analytics",
        name: "Design usage analytics",
        age: "5d",
        provider: "codex"
      }
    ]
  },
  {
    name: "web-dashboard",
    threads: [
      {
        id: "review-checkout-redesign",
        name: "Review checkout redesign",
        age: "1d",
        provider: "codex"
      },
      {
        id: "fix-preview-auth-flow",
        name: "Fix preview auth flow",
        age: "3d",
        provider: "codex"
      }
    ]
  }
];

export const reviewFilePath =
  "/Users/atemjohnatem/Development/composer-ade/src/App.tsx";

export const diffRows: DiffRowData[] = [
  ["126", "+", "const [inspectorOpen, setInspectorOpen] = useState(true);"],
  [
    "127",
    " ",
    'const [activeNav, setActiveNav] = useState<NavKey>("New session");'
  ],
  ["128", " ", "const [selectedThread, setSelectedThread] = useState("],
  ["129", " ", '"Implement workspace indexing"'],
  ["152", "+", "<AppChrome"],
  ["153", " ", "  sidebarOpen={sidebarOpen}"],
  ["154", " ", "  setSidebarOpen={setSidebarOpen}"],
  ["155", "+", "  inspectorOpen={inspectorOpen}"],
  ["156", "+", "  setInspectorOpen={setInspectorOpen}"],
  [
    "178",
    "-",
    '<div className="grid min-h-0 overflow-hidden grid-cols-[minmax(0,1fr)_288px]">'
  ],
  [
    "181",
    "+",
    '<div className="grid min-h-0 overflow-hidden transition-[grid-template-columns]">'
  ],
  ["208", "-", "<Inspector />"],
  ["218", "+", "<ReviewPanel open={inspectorOpen} />"]
];

export const conversationItems: ConversationItem[] = [
  {
    id: "user-setup",
    type: "user_message",
    body: "Now let's switch gears to design components for the conversation chat. For context of the content of the conversation chat, you should look that the codex and claude code project sessions at ~/.codex and ~/.claude",
    timestamp: "4:11 PM"
  },
  {
    id: "user-setup-attachments",
    type: "attachment_group",
    timestamp: "4:11 PM",
    attachments: [
      {
        id: "attachment-reference-1",
        type: "file",
        filename: "Screenshot 2026-05-01 at 4.13.52 PM.png",
        mediaType: "image/png"
      },
      {
        id: "attachment-reference-2",
        type: "file",
        filename: "conversation-sample.jsonl",
        mediaType: "application/json"
      }
    ]
  },
  {
    id: "hook-submit-setup",
    type: "hook_event",
    label: "UserPromptSubmit"
  },
  {
    id: "turn-1",
    type: "turn_status",
    label: "Working for 2m 30s"
  },
  {
    id: "assistant-grounding",
    type: "assistant_message",
    body: "I will ground this in the actual session data shape before proposing components. I am going to inspect the existing Composer conversation code plus the Codex/Claude session file formats, using small samples and avoiding dumping private conversation content back into the thread."
  },
  {
    id: "tool-explore",
    type: "tool_group",
    summary: "Explored 3 files, 1 search, ran 2 commands",
    defaultOpen: true,
    details: [
      { id: "read-conversation", label: "Read Conversation.tsx" },
      { id: "read-mock", label: "Read mock-data.ts" },
      { id: "read-types", label: "Read types.ts" },
      {
        id: "search-chat",
        label:
          "Searched for conversation|timeline|message|tool|command|artifact|diff|composer|chat in src"
      },
      {
        id: "find-files",
        label:
          'Ran find ~/.codex ~/.claude -maxdepth 3 -type f | sed "s#^$HOME#~#" | head -120',
        tone: "command"
      },
      {
        id: "find-dirs",
        label:
          'Ran find ~/.codex ~/.claude -maxdepth 3 -type d | sed "s#^$HOME#~#" | head -120',
        tone: "command"
      }
    ]
  },
  {
    id: "assistant-model",
    type: "assistant_message",
    body: "The existing Composer timeline is still a narrow mock model with only assistant/tool/command/user/edit rows. I am going one level deeper into recent Codex and Claude JSONL records now to identify the real row types we need to represent, without echoing message bodies."
  },
  {
    id: "ran-seven",
    type: "tool_group",
    summary: "Ran 7 commands",
    details: [
      {
        id: "codex-summary",
        label:
          "Summarized Codex response_item and event_msg row types from recent sessions"
      },
      {
        id: "claude-summary",
        label:
          "Summarized Claude message content blocks and tool_use rows from project sessions"
      }
    ]
  },
  {
    id: "assistant-correct",
    type: "assistant_message",
    body: "One Codex query was too loose and hit null response rows; I have enough to correct it. Also the first Claude file I sampled was empty, so I am selecting non-empty project sessions and summarizing only structural keys and types."
  },
  {
    id: "running-sample",
    type: "running_tool",
    label:
      "Running f=\"$HOME/.claude/projects/-Users-atemjohnatem-Development-bfloat-workbench/ede58741-1...\"",
    status: "running"
  },
  {
    id: "thinking",
    type: "notice",
    label: "Thinking"
  },
  {
    id: "user-example",
    type: "user_message",
    body: "Btw, here's an example of how codex renders its sessions",
    timestamp: "4:13 PM",
    steered: true
  },
  {
    id: "hook-submit-example",
    type: "hook_event",
    label: "UserPromptSubmit"
  },
  {
    id: "jump-latest",
    type: "jump_marker",
    label: "Jump to latest"
  },
  {
    id: "turn-2",
    type: "turn_status",
    label: "Working for 3m 30s"
  },
  {
    id: "assistant-implementation",
    type: "assistant_message",
    body: "I implemented the Codex-style transcript primitives directly against typed mock data: compact expandable tool rows, plain assistant text, right-aligned user prompts, and status cards above the composer.",
    attachments: [
      {
        id: "assistant-files",
        type: "file_change_summary",
        summary: "8 files changed",
        additions: 273,
        deletions: 200,
        defaultOpen: true,
        files: [
          { path: "src/App.tsx", additions: 30, deletions: 6 },
          { path: "src/components/Composer.tsx", additions: 2, deletions: 2 },
          { path: "src/components/Conversation.tsx", additions: 1, deletions: 1 },
          { path: "src/components/NewSessionPage.tsx", additions: 1, deletions: 1 },
          { path: "src/components/ReviewPanel.tsx", additions: 3, deletions: 3 },
          { path: "src/components/SettingsPage.tsx", additions: 187, deletions: 155 },
          { path: "src/components/Sidebar.tsx", additions: 24, deletions: 19 },
          { path: "src/styles.css", additions: 25, deletions: 13 }
        ]
      }
    ]
  },
  {
    id: "hook-stop-implementation",
    type: "hook_event",
    label: "Stop"
  }
];

export const pendingConversationItems: PendingConversationItem[] = [
  {
    id: "pending-terminal",
    type: "running_tool",
    label: "Running 1 terminal",
    status: "running",
    details: [
      { id: "terminal-shell", label: "zsh in /Users/atemjohnatem/Development/composer-ade" },
      { id: "terminal-command", label: "npm run dev", tone: "command" }
    ]
  }
];

export const fallbackSessionSnapshot: SessionSnapshot = {
  projects,
  sessions: {
    "implement-workspace-indexing": {
      id: "implement-workspace-indexing",
      provider: "codex",
      title: "Implement workspace indexing",
      model: "GPT-5.5",
      cwd: "/Users/atemjohnatem/Development/composer-ade",
      items: conversationItems,
      pendingItems: pendingConversationItems
    },
    "design-usage-analytics": {
      id: "design-usage-analytics",
      provider: "codex",
      title: "Design usage analytics",
      model: "GPT-5.5",
      items: conversationItems,
      pendingItems: []
    },
    "review-checkout-redesign": {
      id: "review-checkout-redesign",
      provider: "codex",
      title: "Review checkout redesign",
      model: "GPT-5.5",
      items: conversationItems,
      pendingItems: []
    },
    "fix-preview-auth-flow": {
      id: "fix-preview-auth-flow",
      provider: "codex",
      title: "Fix preview auth flow",
      model: "GPT-5.5",
      items: conversationItems,
      pendingItems: []
    }
  }
};
