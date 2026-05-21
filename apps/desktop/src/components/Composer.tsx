import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type ElementType,
  type KeyboardEvent
} from "react";
import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleGauge,
  CloudOff,
  ExternalLink,
  Folder,
  Gauge,
  GitBranch,
  GitCompareArrows,
  GitPullRequestCreateArrow,
  Laptop,
  ListChecks,
  MessageSquare,
  Mic,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Square,
  TerminalSquare
} from "lucide-react";

import type {
  ApprovalDecision,
  ApprovalRequest,
  AgentModel,
  ComposerImageAttachment,
  ComposerReviewCommentAttachment,
  IntelligenceMode,
  PendingConversationItem,
  PermissionMode,
  SessionProvider
} from "../types";
import { cn } from "../lib/cn";
import { ProviderLogo } from "./ProviderLogo";
import {
  appActiveSurface,
  appDangerText,
  appHoverSurface,
  appInsetHighlight,
  appSoftBorder,
  appSoftSurface,
  appWarningBorder,
  appWarningBorderStrong,
  appWarningHoverSurface,
  appWarningSurface,
  appWarningText,
  cardSurface,
  menuItem,
  menuSurface,
  pillButton,
  primaryIconButton,
  primaryButton,
  secondaryButton,
  subtleCardSurface,
  subtleIconButton,
  warningFocusRing
} from "./style-tokens";
import { TooltipButton } from "./ui/tooltip-button";

type ComposerProvider = SessionProvider;

type ModelOption = {
  value: AgentModel;
  label: string;
  detail: string;
  efforts: IntelligenceMode[];
};

const providerModels: Record<ComposerProvider, ModelOption[]> = {
  codex: [
    {
      value: "gpt-5.5",
      label: "GPT-5.5",
      detail: "Frontier coding model",
      efforts: ["Low", "Medium", "High", "Extra High"]
    },
    {
      value: "gpt-5.4",
      label: "GPT-5.4",
      detail: "Balanced coding model",
      efforts: ["Low", "Medium", "High", "Extra High"]
    },
    {
      value: "gpt-5.4-mini",
      label: "GPT-5.4 Mini",
      detail: "Fast lightweight model",
      efforts: ["Low", "Medium", "High"]
    }
  ],
  claude: [
    {
      value: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      detail: "Balanced Claude Code model",
      efforts: ["Low", "Medium", "High"]
    },
    {
      value: "claude-opus-4-7",
      label: "Claude Opus 4.7",
      detail: "Deep reasoning model",
      efforts: ["Low", "Medium", "High", "Extra High"]
    }
  ],
  meta: [
    {
      value: "meta-planner-review",
      label: "Planner review",
      detail: "Claude plans high, Codex executes low",
      efforts: ["High"]
    },
    {
      value: "meta-parallel-initial",
      label: "Parallel initial",
      detail: "Codex and Claude start together",
      efforts: ["High"]
    }
  ]
};

export type ComposerProps = {
  permission: PermissionMode;
  setPermission: (value: PermissionMode) => void;
  model: AgentModel;
  setModel: (value: AgentModel) => void;
  intelligence: IntelligenceMode;
  setIntelligence: (value: IntelligenceMode) => void;
  permissionOpen: boolean;
  setPermissionOpen: (value: boolean) => void;
  intelligenceOpen: boolean;
  setIntelligenceOpen: (value: boolean) => void;
  permissionMenuId: string;
  intelligenceMenuId: string;
  provider: SessionProvider;
  setProvider: (value: SessionProvider) => void;
  value: string;
  setValue: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  submitMode?: "send" | "stop";
  submitDisabled?: boolean;
  imageAttachments?: ComposerImageAttachment[];
  reviewCommentAttachments?: ComposerReviewCommentAttachment[];
  onAddImageAttachments?: (files: File[]) => void;
  onRemoveImageAttachment?: (id: string) => void;
  onRemoveReviewCommentAttachment?: (id: string) => void;
  pendingItems?: PendingConversationItem[];
  approvals?: ApprovalRequest[];
  onResolveApproval?: (approvalId: string, decision: ApprovalDecision) => void;
};

export type PromptComposerControls = Omit<ComposerProps, "pendingItems">;

export type PromptComposerFooterItem = {
  icon: ElementType;
  label: string;
  options?: PromptComposerFooterOption[];
  menuItems?: PromptComposerFooterMenuItem[];
  menuTitle?: string;
  menuPlacement?: "up" | "down";
  selectedOptionId?: string;
  searchPlaceholder?: string;
  createLabel?: string;
  onSelect?: (option: PromptComposerFooterOption) => void;
  onCreate?: (query: string) => void | Promise<void>;
};

export type PromptComposerFooterMenuItem = {
  icon: ElementType;
  label: string;
  checked?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  trailingIcon?: ElementType;
  onSelect?: () => void;
};

const localWorkMenuBaseItems: PromptComposerFooterMenuItem[] = [
  {
    icon: Laptop,
    label: "Work locally",
    checked: true
  },
  {
    icon: CircleGauge,
    label: "Connect Codex web",
    trailingIcon: ExternalLink
  },
  {
    icon: CloudOff,
    label: "Send to cloud",
    disabled: true
  }
];

export const startInFooterMenuItems: PromptComposerFooterMenuItem[] = [
  ...localWorkMenuBaseItems.slice(0, 1),
  {
    icon: GitPullRequestCreateArrow,
    label: "New worktree"
  },
  ...localWorkMenuBaseItems.slice(1),
  {
    icon: Gauge,
    label: "Rate limits remaining",
    separatorBefore: true,
    trailingIcon: ChevronRight
  }
];

export const continueInFooterMenuItems: PromptComposerFooterMenuItem[] = [
  ...localWorkMenuBaseItems,
  {
    icon: Gauge,
    label: "Rate limits remaining",
    separatorBefore: true,
    trailingIcon: ChevronRight
  },
  {
    icon: GitCompareArrows,
    label: "Handoff to worktree",
    disabled: true,
    separatorBefore: true
  }
];

export type PromptComposerFooterOption = {
  id: string;
  label: string;
  cwd?: string;
  detail?: string;
};

export type PromptComposerProps = PromptComposerControls & {
  className?: string;
  placeholder: string;
  textareaRows?: number;
  showAttachmentPill?: boolean;
  showPlanButton?: boolean;
  submitMode?: "send" | "stop";
  submitLabel?: string;
  footerItems?: PromptComposerFooterItem[];
};

export function PromptComposer({
  className = "",
  permission,
  setPermission,
  model,
  setModel,
  intelligence,
  setIntelligence,
  permissionOpen,
  setPermissionOpen,
  intelligenceOpen,
  setIntelligenceOpen,
  permissionMenuId,
  intelligenceMenuId,
  provider,
  setProvider,
  value,
  setValue,
  placeholder,
  textareaRows = 1,
  showAttachmentPill = true,
  showPlanButton = true,
  submitMode = "stop",
  submitLabel = submitMode === "send" ? "Start session" : "Stop",
  onSubmit,
  onStop,
  submitDisabled = false,
  imageAttachments = [],
  reviewCommentAttachments = [],
  onAddImageAttachments,
  onRemoveImageAttachment,
  onRemoveReviewCommentAttachment,
  footerItems = [
    {
      icon: Laptop,
      label: "Work locally",
      menuTitle: "Continue in",
      menuItems: continueInFooterMenuItems,
      menuPlacement: "up"
    },
    { icon: GitBranch, label: "main" }
  ]
}: PromptComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeProvider = composerProvider(provider);
  const selectedModel = modelOption(activeProvider, model);
  const compactModelLabel = compactModelOptionLabel(selectedModel);

  useEffect(() => {
    if (!selectedModel.efforts.includes(intelligence)) {
      setIntelligence(defaultEffort(selectedModel));
    }
  }, [intelligence, selectedModel, setIntelligence]);

  function addImageFiles(files: Iterable<File>) {
    const images = Array.from(files).filter((file) =>
      file.type.startsWith("image/")
    );

    if (images.length > 0) {
      onAddImageAttachments?.(images);
    }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    addImageFiles(event.target.files ?? []);
    event.target.value = "";
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    addImageFiles(event.clipboardData.files);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (Array.from(event.dataTransfer.items).some((item) => item.type.startsWith("image/"))) {
      event.preventDefault();
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    const images = Array.from(event.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/")
    );

    if (images.length === 0) {
      return;
    }

    event.preventDefault();
    addImageFiles(images);
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();

    if (submitMode === "send" && !submitDisabled) {
      onSubmit();
    }
  }

  return (
    <div
      data-composer-content
      className={`pointer-events-auto relative mx-auto w-full max-w-[820px] ${className}`}
    >
      {permissionOpen && (
        <PermissionMenu
          id={permissionMenuId}
          permission={permission}
          setPermission={(value) => {
            setPermission(value);
            setPermissionOpen(false);
          }}
        />
      )}
      {intelligenceOpen && (
        <ModelSettingsMenu
          id={intelligenceMenuId}
          provider={activeProvider}
          model={selectedModel.value}
          setModel={(value) => {
            setModel(value);
            const nextModel = modelOption(activeProvider, value);

            if (!nextModel.efforts.includes(intelligence)) {
              setIntelligence(defaultEffort(nextModel));
            }
          }}
          intelligence={intelligence}
          setIntelligence={(value) => {
            setIntelligence(value);
            setIntelligenceOpen(false);
          }}
        />
      )}

      <div
        className={cn("relative z-10 min-h-[84px] px-3 py-2", cardSurface)}
        role="group"
        aria-label="Prompt composer"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {showAttachmentPill && (imageAttachments.length > 0 || reviewCommentAttachments.length > 0) && (
          <div className="mb-1 flex max-w-full flex-wrap gap-1.5">
            {imageAttachments.map((attachment) => (
              <ImageAttachmentPill
                key={attachment.id}
                attachment={attachment}
                onRemove={() => onRemoveImageAttachment?.(attachment.id)}
              />
            ))}
            {reviewCommentAttachments.map((attachment) => (
              <ReviewCommentAttachmentPill
                key={attachment.id}
                attachment={attachment}
                onRemove={() => onRemoveReviewCommentAttachment?.(attachment.id)}
              />
            ))}
          </div>
        )}
        <textarea
          aria-label="Ask Composer"
          className="mt-0.5 min-h-7 w-full resize-none rounded-md bg-transparent px-1 text-[13px] leading-6 text-app-text outline-none placeholder:text-app-dim focus-visible:outline-none focus-visible:ring-0"
          placeholder={placeholder}
          rows={textareaRows}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
          onPaste={handlePaste}
        />
        <div className="composer-action-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5">
          <div className="composer-left-controls flex min-w-0 flex-nowrap items-center gap-2 overflow-hidden">
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileInputChange}
            />
            <TooltipButton
              className={subtleIconButton}
              aria-label="Attach"
              onClick={() => fileInputRef.current?.click()}
              tooltip="Attach image"
              type="button"
            >
              <Plus size={17} />
            </TooltipButton>
            {showPlanButton && (
              <TooltipButton
                className={cn(
                  "composer-plan-button h-[30px] shrink-0 gap-1.5 px-2 text-[13px]",
                  pillButton
                )}
                aria-label="Plan"
                tooltip="Plan response"
                type="button"
              >
                <ListChecks size={13} />
                <span className="composer-collapsible-text">Plan</span>
              </TooltipButton>
            )}
            <TooltipButton
              className={cn(
                "composer-permission-button inline-flex h-[30px] min-w-0 max-w-[160px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[13px] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-app-text)_3.5%,transparent)] transition-colors",
                appWarningBorder,
                appWarningSurface,
                appWarningText,
                appWarningHoverSurface,
                warningFocusRing
              )}
              onClick={() => setPermissionOpen(!permissionOpen)}
              aria-label={`Permission: ${permission}`}
              aria-controls={permissionMenuId}
              aria-expanded={permissionOpen}
              aria-haspopup="menu"
              tooltip={`Permission: ${permission}`}
              type="button"
            >
              <ShieldAlert className="shrink-0" size={14} />
              <span className="composer-collapsible-text truncate">
                {permission}
              </span>
              <ChevronDown className="shrink-0" size={13} />
            </TooltipButton>
            <ProviderToggle provider={provider} setProvider={setProvider} />
          </div>

          <div className="composer-right-controls flex min-w-0 flex-nowrap items-center justify-end gap-2">
            <span className="h-3.5 w-3.5 shrink-0 rounded-full border-[3px] border-app-text/10 border-t-app-text/35" />
            <TooltipButton
              className={cn(
                "composer-model-button h-[30px] min-w-0 max-w-[164px] gap-1.5 px-2.5 text-[13px]",
                pillButton
              )}
              onClick={() => setIntelligenceOpen(!intelligenceOpen)}
              aria-label={`Model: ${selectedModel.label}, ${
                activeProvider === "meta" ? "Auto" : intelligence
              }`}
              aria-controls={intelligenceMenuId}
              aria-expanded={intelligenceOpen}
              aria-haspopup="menu"
              tooltip={`Model: ${selectedModel.label} · ${
                activeProvider === "meta" ? "Auto" : intelligence
              }`}
              type="button"
            >
              <Bot className="composer-model-icon hidden shrink-0" size={14} />
              <span className="composer-model-label composer-model-label-full truncate">
                {selectedModel.label}
              </span>
              <span className="composer-model-label-compact hidden truncate">
                {compactModelLabel}
              </span>
              <em className="composer-model-effort shrink-0 not-italic text-app-dim">
                {activeProvider === "meta" ? "Auto" : intelligence}
              </em>
              <ChevronDown className="shrink-0" size={13} />
            </TooltipButton>
            <TooltipButton
              className={subtleIconButton}
              aria-label="Voice"
              tooltip="Voice input"
            >
              <Mic size={14} />
            </TooltipButton>
            <TooltipButton
              className={primaryIconButton}
              aria-label={submitLabel}
              disabled={submitDisabled}
              onClick={submitMode === "send" ? onSubmit : (onStop ?? onSubmit)}
              tooltip={submitLabel}
              type="button"
            >
              {submitMode === "send" ? (
                <ArrowUp size={17} />
              ) : (
                <Square size={14} fill="currentColor" />
              )}
            </TooltipButton>
          </div>
        </div>
      </div>

      <div className="composer-footer-row flex items-center gap-5 px-3.5 pt-2">
        {footerItems.map((item) => (
          <ComposerFooterButton
            key={item.label}
            icon={item.icon}
            label={item.label}
            options={item.options}
            menuItems={item.menuItems}
            menuTitle={item.menuTitle}
            menuPlacement={item.menuPlacement}
            selectedOptionId={item.selectedOptionId}
            searchPlaceholder={item.searchPlaceholder}
            createLabel={item.createLabel}
            onSelect={item.onSelect}
            onCreate={item.onCreate}
          />
        ))}
      </div>
    </div>
  );
}

function ImageAttachmentPill({
  attachment,
  onRemove
}: {
  attachment: ComposerImageAttachment;
  onRemove: () => void;
}) {
  return (
    <div className={cn("inline-flex h-7 max-w-[210px] items-center gap-2 py-0.5 pl-1 pr-2 text-[13px] text-app-text", pillButton)}>
      <img
        alt=""
        className="h-5 w-5 shrink-0 rounded-full border border-app-text/10 object-cover"
        src={attachment.previewUrl}
      />
      <span className="min-w-0 truncate">{attachment.name}</span>
      <TooltipButton
        className={cn(subtleIconButton, "ml-0.5")}
        aria-label={`Remove ${attachment.name}`}
        onClick={onRemove}
        tooltip={`Remove ${attachment.name}`}
        type="button"
      >
        ×
      </TooltipButton>
    </div>
  );
}

function ReviewCommentAttachmentPill({
  attachment,
  onRemove
}: {
  attachment: ComposerReviewCommentAttachment;
  onRemove: () => void;
}) {
  return (
    <div className={cn("grid max-w-[360px] grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 py-1.5 pl-2 pr-1.5 text-[13px] text-app-text", pillButton)}>
      <MessageSquare className="mt-0.5 shrink-0 text-app-muted" size={15} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2 text-[12px] text-app-muted">
          <span className="min-w-0 truncate font-medium text-app-text">
            {attachment.filePath}
          </span>
          <span className="shrink-0">
            {attachment.side} {attachment.lineNumber}
          </span>
        </div>
        <div className="truncate text-[12.5px] leading-5 text-app-text">
          {attachment.body}
        </div>
      </div>
      <TooltipButton
        className={cn(subtleIconButton, "ml-0.5")}
        aria-label={`Remove comment on ${attachment.filePath}`}
        onClick={onRemove}
        tooltip={`Remove comment on ${attachment.filePath}`}
        type="button"
      >
        ×
      </TooltipButton>
    </div>
  );
}

export function Composer({ pendingItems = [], ...controls }: ComposerProps) {
  return (
    <div className="composer-fade pointer-events-none absolute inset-x-0 bottom-0 z-10 px-5 pb-4 pt-10">
      <div className="pointer-events-auto relative mx-auto w-full max-w-[820px]">
        <PendingTerminalStack
          items={pendingItems}
          approvals={controls.approvals ?? []}
          onResolveApproval={controls.onResolveApproval}
          onStop={controls.onStop}
        />
        <PromptComposer
          {...controls}
          placeholder="Ask Composer to build, debug, or review"
        />
      </div>
    </div>
  );
}

function ProviderToggle({
  provider,
  setProvider
}: {
  provider: SessionProvider;
  setProvider: (value: SessionProvider) => void;
}) {
  const providers = [
    { value: "codex", label: "Codex" },
    { value: "claude", label: "Claude" },
    { value: "meta", label: "Hybrid" }
  ] satisfies Array<{ value: ComposerProvider; label: string }>;
  const visibleProvider: ComposerProvider = provider;

  return (
    <div
      className={cn(
        "composer-provider-toggle inline-grid min-w-0 shrink grid-cols-3 rounded-full border p-0.5 text-[12px] text-app-muted",
        appSoftBorder,
        appSoftSurface,
        appInsetHighlight
      )}
    >
      {providers.map(({ value, label }) => (
        <TooltipButton
          key={value}
          className={[
            "composer-provider-button inline-flex h-[26px] min-w-0 items-center gap-1 rounded-full px-2 transition-colors",
            visibleProvider === value
              ? "bg-app-text/[0.12] text-app-text shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-app-text)_4%,transparent)]"
              : appHoverSurface
          ].join(" ")}
          aria-label={label}
          onClick={() => setProvider(value)}
          tooltip={`Switch to ${label}`}
          type="button"
        >
          <ProviderLogo provider={value} className="h-3.5 w-3.5" />
          <span className="composer-provider-label truncate">{label}</span>
        </TooltipButton>
      ))}
    </div>
  );
}

function composerProvider(provider: SessionProvider): ComposerProvider {
  return provider;
}

function ApprovalButton({
  label,
  primary = false,
  onClick
}: {
  label: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <TooltipButton
      className={[
        "h-7 px-2.5 text-[12px]",
        primary ? primaryButton : secondaryButton
      ].join(" ")}
      onClick={onClick}
      tooltip={label}
      type="button"
    >
      {label}
    </TooltipButton>
  );
}

function PendingTerminalStack({
  items,
  approvals,
  onResolveApproval,
  onStop
}: {
  items: PendingConversationItem[];
  approvals: ApprovalRequest[];
  onResolveApproval?: (approvalId: string, decision: ApprovalDecision) => void;
  onStop?: () => void;
}) {
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-0 -translate-y-full px-5">
      <div className="pointer-events-auto mx-auto grid w-full max-w-[760px] gap-0">
        {items.map((item, index) => {
          const approval = approvalForPendingItem(item, approvals, index);
          const expanded = Boolean(expandedById[item.id] ?? approval);
          const details =
            item.details && item.details.length > 0
              ? item.details
              : [{ id: `${item.id}-active`, label: "Terminal session active" }];
          const expandedHeight = approval ? "h-[184px]" : "h-[98px]";

          return (
            <div
              key={item.id}
              data-expanded={expanded}
              data-awaiting-approval={Boolean(approval)}
              data-pending-terminal-card
              className={[
                "overflow-hidden rounded-t-[18px] border border-b-0 bg-app-panel-2/92 text-[13px] text-app-muted shadow-[0_18px_48px_color-mix(in_srgb,var(--color-app-bg)_34%,transparent),inset_0_1px_0_color-mix(in_srgb,var(--color-app-text)_3.5%,transparent)] transition-[height] duration-200 ease-in-out",
                approval ? appWarningBorderStrong : appSoftBorder,
                expanded ? expandedHeight : "h-[40px]"
              ].join(" ")}
            >
              <div className="grid h-10 grid-cols-[20px_minmax(0,1fr)_22px_22px] items-center gap-2.5 px-3.5">
                <TerminalSquare size={14} />
                <span className="truncate">{item.label}</span>
                <TooltipButton
                  className={subtleIconButton}
                  aria-label="Stop running tool"
                  onClick={onStop}
                  tooltip="Stop running tool"
                  type="button"
                >
                  <Square size={10} fill="currentColor" />
                </TooltipButton>
                <TooltipButton
                  className={subtleIconButton}
                  aria-label={
                    expanded ? "Collapse running tool" : "Expand running tool"
                  }
                  aria-expanded={expanded}
                  onClick={() =>
                    setExpandedById((current) => ({
                      ...current,
                      [item.id]: !expanded
                    }))
                  }
                  tooltip={
                    expanded ? "Collapse running tool" : "Expand running tool"
                  }
                  type="button"
                >
                  <ChevronDown
                    className={[
                      "transition-transform duration-200 ease-in-out",
                      expanded ? "rotate-0" : "-rotate-90"
                    ].join(" ")}
                    size={15}
                  />
                </TooltipButton>
              </div>
              <div className="grid gap-1 border-t border-app-line/70 px-3.5 py-2 text-[12px] text-app-dim">
                {details.map((detail) => (
                  <div
                    key={detail.id}
                    className={[
                      "truncate",
                      detail.tone === "command" ? "font-mono text-[11px]" : ""
                    ].join(" ")}
                    title={detail.label}
                  >
                    {detail.label}
                  </div>
                ))}
                {approval && (
                  <InlineApproval
                    approval={approval}
                    onResolveApproval={onResolveApproval}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function approvalForPendingItem(
  item: PendingConversationItem,
  approvals: ApprovalRequest[],
  index: number
) {
  return (
    approvals.find((approval) => approval.title === item.label) ??
    approvals.find((approval) => item.label.includes(approval.title)) ??
    approvals[index]
  );
}

function InlineApproval({
  approval,
  onResolveApproval
}: {
  approval: ApprovalRequest;
  onResolveApproval?: (approvalId: string, decision: ApprovalDecision) => void;
}) {
  return (
    <div
      className={cn(
        "mt-2 grid gap-2 rounded-[14px] border bg-app-panel-2/85 p-2.5",
        appWarningBorder,
        appInsetHighlight
      )}
    >
      <div className="grid gap-1">
        <div className="text-[13px] font-medium text-app-text">
          {approval.title}
        </div>
        {approval.details && (
          <div className="line-clamp-2 text-[12px] text-app-dim">
            {Object.entries(approval.details)
              .slice(0, 4)
              .map(([key, value]) => `${key}: ${value}`)
              .join(" · ")}
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <ApprovalButton
          label="Deny"
          onClick={() => onResolveApproval?.(approval.id, "decline")}
        />
        {approval.availableDecisions.includes("cancel") && (
          <ApprovalButton
            label="Cancel"
            onClick={() => onResolveApproval?.(approval.id, "cancel")}
          />
        )}
        {approval.availableDecisions.includes("acceptForSession") && (
          <ApprovalButton
            label="Allow session"
            onClick={() => onResolveApproval?.(approval.id, "acceptForSession")}
          />
        )}
        <ApprovalButton
          label="Allow"
          primary
          onClick={() => onResolveApproval?.(approval.id, "accept")}
        />
      </div>
    </div>
  );
}

function ComposerFooterButton({
  icon: Icon,
  label,
  options,
  menuItems,
  menuTitle,
  menuPlacement = "up",
  selectedOptionId,
  searchPlaceholder = "Search",
  createLabel = "New project",
  onSelect,
  onCreate
}: {
  icon: ElementType;
  label: string;
  options?: PromptComposerFooterOption[];
  menuItems?: PromptComposerFooterMenuItem[];
  menuTitle?: string;
  menuPlacement?: "up" | "down";
  selectedOptionId?: string;
  searchPlaceholder?: string;
  createLabel?: string;
  onSelect?: (option: PromptComposerFooterOption) => void;
  onCreate?: (query: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasCustomMenu = Boolean(menuItems?.length);
  const hasMenu = Boolean(hasCustomMenu || options?.length || onCreate);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = (options ?? []).filter((option) =>
    `${option.label} ${option.detail ?? ""} ${option.cwd ?? ""}`
      .toLowerCase()
      .includes(normalizedQuery)
  );
  const createActionLabel = query.trim()
    ? `Create "${query.trim()}"`
    : createLabel;

  async function handleCreate() {
    if (!onCreate || creating) {
      return;
    }

    setCreating(true);
    setError(null);

    try {
      await onCreate(query.trim());
      setOpen(false);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : String(createError)
      );
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (!open) {
      setQuery("");
      setError(null);
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!hasMenu) {
    return (
      <TooltipButton
        className={cn(
          "composer-footer-button h-8 gap-1.5 px-2.5 text-[13px]",
          pillButton,
          "border-transparent bg-transparent text-app-dim shadow-none hover:bg-app-text/[0.06] hover:text-app-muted"
        )}
        aria-label={label}
        tooltip={label}
        type="button"
      >
        <Icon className="shrink-0" size={14} />
        <span className="composer-footer-label max-w-[180px] truncate">
          {label}
        </span>
        <ChevronDown className="composer-footer-chevron shrink-0" size={12} />
      </TooltipButton>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      <TooltipButton
        className={cn(
          "composer-footer-button h-8 max-w-[280px] gap-1.5 px-3 text-[13px]",
          pillButton,
          open
            ? "bg-app-text/[0.09] text-app-text"
            : "border-transparent bg-transparent text-app-dim shadow-none hover:bg-app-text/[0.06] hover:text-app-muted"
        )}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        tooltip={label}
        type="button"
      >
        <Icon className="shrink-0" size={15} />
        <span className="composer-footer-label min-w-0 truncate">{label}</span>
        <ChevronDown
          className={[
            "composer-footer-chevron shrink-0 transition-transform",
            open ? "rotate-180" : ""
          ].join(" ")}
          size={13}
        />
      </TooltipButton>

      {open && (
        <div
          className={cn(
            "absolute left-0 z-30 grid w-[min(430px,calc(100vw-48px))] gap-1 text-[14px]",
            menuSurface,
            menuPlacement === "up"
              ? "bottom-[calc(100%+8px)]"
              : "top-[calc(100%+8px)]"
          )}
          role="menu"
          aria-label={label}
        >
          {hasCustomMenu ? (
            <ComposerFooterCustomMenu
              title={menuTitle}
              items={menuItems ?? []}
              onClose={() => setOpen(false)}
            />
          ) : (
            <>
              <label className="grid h-9 grid-cols-[22px_minmax(0,1fr)] items-center gap-1 rounded-lg px-2 text-app-dim">
                <Search size={15} />
                <input
                  className="h-full min-w-0 bg-transparent text-[14px] text-app-text outline-none placeholder:text-app-dim"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      filteredOptions.length === 0 &&
                      onCreate
                    ) {
                      event.preventDefault();
                      void handleCreate();
                    }
                  }}
                  placeholder={searchPlaceholder}
                  autoFocus
                />
              </label>

              <div className="max-h-[260px] overflow-y-auto border-t border-app-line pt-1">
                {filteredOptions.map((option) => {
                  const selected = option.id === selectedOptionId;

                  return (
                    <TooltipButton
                      key={option.id}
                      className={cn(
                        "grid min-h-10 w-full grid-cols-[24px_minmax(0,1fr)_20px] items-center gap-2 px-2 text-app-text",
                        menuItem,
                        selected ? `${appActiveSurface} text-app-text` : ""
                      )}
                      onClick={() => {
                        onSelect?.(option);
                        setOpen(false);
                      }}
                      role="menuitemradio"
                      aria-checked={selected}
                      tooltip={`Select ${option.label}`}
                      type="button"
                    >
                      <Folder className="text-app-muted" size={16} />
                      <span className="grid min-w-0">
                        <span className="truncate">{option.label}</span>
                        {option.detail && (
                          <span className="truncate text-[12px] text-app-dim">
                            {option.detail}
                          </span>
                        )}
                      </span>
                      {selected && <Check size={15} />}
                    </TooltipButton>
                  );
                })}

                {filteredOptions.length === 0 && (
                  <div className="px-2 py-3 text-[13px] text-app-dim">
                    No projects found
                  </div>
                )}
              </div>

              {onCreate && (
                <TooltipButton
                  className={cn(
                    "grid min-h-10 w-full grid-cols-[24px_minmax(0,1fr)] items-center gap-2 border-t border-app-line px-2 pt-2 text-app-text disabled:cursor-not-allowed disabled:opacity-60",
                    menuItem
                  )}
                  disabled={creating}
                  onClick={() => void handleCreate()}
                  tooltip={creating ? "Creating project" : createActionLabel}
                  type="button"
                >
                  <Plus className="text-app-muted" size={16} />
                  <span className="truncate">
                    {creating ? "Creating project..." : createActionLabel}
                  </span>
                </TooltipButton>
              )}

              {error && (
                <div className={cn("px-2 pb-1 text-[12px]", appDangerText)}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ComposerFooterCustomMenu({
  title = "Continue in",
  items,
  onClose
}: {
  title?: string;
  items: PromptComposerFooterMenuItem[];
  onClose: () => void;
}) {
  return (
    <>
      <div className="px-3 pb-2 pt-1 text-[14px] font-medium text-app-dim">
        {title}
      </div>
      <div className="grid gap-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const TrailingIcon =
            item.trailingIcon ?? (item.checked ? Check : undefined);

          return (
            <TooltipButton
              key={item.label}
              className={cn(
                "grid min-h-10 w-full grid-cols-[24px_minmax(0,1fr)_20px] items-center gap-2 px-2 text-[14px]",
                menuItem,
                item.separatorBefore ? "mt-1 border-t border-app-line pt-2" : "",
                item.disabled
                  ? "cursor-not-allowed text-app-dim/60"
                  : "text-app-text hover:bg-app-text/[0.06]"
              )}
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) {
                  return;
                }

                item.onSelect?.();
                onClose();
              }}
              role={item.checked ? "menuitemradio" : "menuitem"}
              aria-checked={item.checked}
              tooltip={item.label}
              type="button"
            >
              <Icon
                className={item.disabled ? "text-app-dim/60" : "text-app-muted"}
                size={16}
              />
              <span className="truncate">{item.label}</span>
              {TrailingIcon && (
                <TrailingIcon
                  className={item.disabled ? "text-app-dim/60" : "text-app-muted"}
                  size={16}
                />
              )}
            </TooltipButton>
          );
        })}
      </div>
    </>
  );
}

function PermissionMenu({
  id,
  permission,
  setPermission
}: {
  id: string;
  permission: PermissionMode;
  setPermission: (value: PermissionMode) => void;
}) {
  const options: Array<[PermissionMode, ElementType]> = [
    ["Default permissions", Shield],
    ["Auto-review", ShieldCheck],
    ["Full access", ShieldAlert]
  ];

  return (
    <div
      id={id}
      className={cn("absolute bottom-[108px] left-[74px] z-20 grid min-w-[220px] gap-1", menuSurface)}
      role="menu"
      aria-label="Permission mode"
    >
      {options.map(([label, Icon]) => (
        <TooltipButton
          key={label}
          className={cn(
            "grid min-h-9 grid-cols-[20px_minmax(0,1fr)_18px] items-center gap-2 px-2 text-[14px] text-app-text",
            menuItem,
            permission === label && `${appActiveSurface} text-app-text`
          )}
          onClick={() => setPermission(label)}
          role="menuitemradio"
          aria-checked={permission === label}
          tooltip={`Select ${label}`}
        >
          <Icon size={14} />
          <span>{label}</span>
          {permission === label && <Check size={14} />}
        </TooltipButton>
      ))}
    </div>
  );
}

function ModelSettingsMenu({
  id,
  provider,
  model,
  setModel,
  intelligence,
  setIntelligence
}: {
  id: string;
  provider: ComposerProvider;
  model: AgentModel;
  setModel: (value: AgentModel) => void;
  intelligence: IntelligenceMode;
  setIntelligence: (value: IntelligenceMode) => void;
}) {
  const models = providerModels[provider];
  const selectedModel = modelOption(provider, model);
  const efforts = selectedModel.efforts;
  const providerLabel =
    provider === "meta" ? "Hybrid" : provider === "codex" ? "Codex" : "Claude";
  const effortLabel =
    provider === "meta"
      ? "Planner and executor"
      : provider === "codex"
        ? "Reasoning effort"
        : "Thinking effort";
  const metaExecutionDetails =
    selectedModel.value === "meta-parallel-initial"
      ? [
          ["Codex", "Starts a GPT-5.4 thread immediately"],
          ["Claude", "Starts a Claude Sonnet 4.6 thread immediately"]
        ]
      : [
          ["Claude Opus 4.7", "Planning with Extra High thinking"],
          ["GPT-5.4 Mini", "Execution with Low reasoning"]
        ];

  return (
    <div
      id={id}
      className={cn("absolute -right-2 bottom-[64px] z-20 grid min-w-[280px] gap-1", menuSurface)}
      role="menu"
      aria-label={`${providerLabel} model settings`}
    >
      <div className="px-3 pb-2.5 pt-1 text-[14px] text-app-muted">
        {providerLabel} model
      </div>
      {models.map((option) => (
        <TooltipButton
          key={option.value}
          className={cn(
            "grid min-h-11 grid-cols-[minmax(0,1fr)_18px] items-center px-2 text-[14px] text-app-text",
            menuItem,
            selectedModel.value === option.value && appActiveSurface
          )}
          onClick={() => setModel(option.value)}
          role="menuitemradio"
          aria-checked={selectedModel.value === option.value}
          tooltip={`Select ${option.label}`}
        >
          <span className="grid min-w-0">
            <span className="truncate">{option.label}</span>
            <span className="truncate text-[12px] text-app-dim">
              {option.detail}
            </span>
          </span>
          {selectedModel.value === option.value && <Check size={14} />}
        </TooltipButton>
      ))}
      <div className="my-1 h-px bg-app-line" />
      <div className="px-3 pb-2 pt-1 text-[14px] text-app-muted">
        {effortLabel}
      </div>
      {provider === "meta" ? (
        <div className="grid gap-1 px-2 pb-1 text-[13px] text-app-text">
          {metaExecutionDetails.map(([title, detail]) => (
            <div key={title} className={cn("px-2.5 py-2", subtleCardSurface)}>
              <div className="text-app-text">{title}</div>
              <div className="text-[12px] text-app-dim">
                {detail}
              </div>
            </div>
          ))}
        </div>
      ) : (
        efforts.map((label) => (
          <TooltipButton
            key={label}
            className={cn(
              "grid min-h-9 grid-cols-[minmax(0,1fr)_18px] items-center px-2 text-[14px] text-app-text",
              menuItem,
              intelligence === label && appActiveSurface
            )}
            onClick={() => setIntelligence(label)}
            role="menuitemradio"
            aria-checked={intelligence === label}
            tooltip={`Set ${effortLabel}: ${label}`}
          >
            <span>{label}</span>
            {intelligence === label && <Check size={14} />}
          </TooltipButton>
        ))
      )}
    </div>
  );
}

function modelOption(provider: ComposerProvider, value: AgentModel) {
  return (
    providerModels[provider].find((option) => option.value === value) ??
    providerModels[provider][0]
  );
}

function compactModelOptionLabel(option: ModelOption) {
  if (option.value.startsWith("gpt-")) {
    return option.label.replace(/^GPT-/, "");
  }

  if (option.value.includes("sonnet")) {
    return "Sonnet";
  }

  if (option.value.includes("opus")) {
    return "Opus";
  }

  if (option.value.startsWith("meta-")) {
    return "Plan -> Execute";
  }

  return option.label;
}

function defaultEffort(option: ModelOption) {
  return option.efforts.includes("High")
    ? "High"
    : option.efforts[option.efforts.length - 1];
}
