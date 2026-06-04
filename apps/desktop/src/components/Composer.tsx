import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type ComponentProps,
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
  CornerDownRight,
  ExternalLink,
  Folder,
  Gauge,
  GitBranch,
  GitCompareArrows,
  GitPullRequestCreateArrow,
  GripVertical,
  Laptop,
  ListTree,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Square,
  TerminalSquare,
  Trash2,
  X
} from "lucide-react";

import type {
  ApprovalDecision,
  ApprovalRequest,
  AgentModel,
  ComposerImageAttachment,
  ComposerReviewCommentAttachment,
  DelegateSessionProvider,
  IntelligenceMode,
  PendingConversationItem,
  PermissionMode,
  QueuedUserMessage,
  SessionProvider
} from "../types";
import {
  providerLabel,
  providerModelOption,
  providerModelOptions,
  runtimeProviderDefinitions,
  type ProviderModelOption
} from "../provider-registry";
import { cn } from "../lib/cn";
import { useComposerStore } from "../state/composer-store";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ProviderLogo } from "./ProviderLogo";
import {
  appActiveSurface,
  appDangerText,
  appHoverSurface,
  appInsetHighlight,
  appSoftBorder,
  appWarningBorder,
  appWarningBorderStrong,
  appWarningHoverSurface,
  appWarningText,
  cardSurface,
  menuItem,
  pillButton,
  primaryIconButton,
  primaryButton,
  secondaryButton,
  subtleIconButton,
  warningFocusRing
} from "./style-tokens";
import { GlassPanel } from "./liquid-glass/GlassPanel";
import { TooltipButton } from "./ui/tooltip-button";

type ComposerProvider = SessionProvider;

export type ComposerProps = {
  permission: PermissionMode;
  setPermission: (value: PermissionMode) => void;
  model: AgentModel;
  setModel: (value: AgentModel) => void;
  composeAgentModels: Record<DelegateSessionProvider, AgentModel>;
  setComposeAgentModel: (
    provider: DelegateSessionProvider,
    value: AgentModel
  ) => void;
  intelligence: IntelligenceMode;
  setIntelligence: (value: IntelligenceMode) => void;
  composeAgentIntelligence: Record<DelegateSessionProvider, IntelligenceMode>;
  setComposeAgentIntelligence: (
    provider: DelegateSessionProvider,
    value: IntelligenceMode
  ) => void;
  permissionOpen: boolean;
  setPermissionOpen: (value: boolean) => void;
  intelligenceOpen: boolean;
  setIntelligenceOpen: (value: boolean) => void;
  permissionMenuId: string;
  intelligenceMenuId: string;
  provider: SessionProvider;
  setProvider: (value: SessionProvider) => void;
  // The controlled draft text lives in useComposerStore. Composer subscribes to
  // it directly so keystrokes only re-render Composer (not the App root). These
  // remain accepted for backwards compatibility / explicit overrides, but are
  // optional — when omitted the store value/setter is used.
  value?: string;
  setValue?: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  submitMode?: "send" | "stop";
  submitDisabled?: boolean;
  disabled?: boolean;
  // When true and the (store-owned) prompt is empty, the send action is
  // disabled. Lets the parent express "non-empty prompt required" without
  // subscribing to every keystroke itself.
  requireNonEmptyPrompt?: boolean;
  layout?: "overlay" | "inline";
  // When false, the Compose (parallel) provider is hidden from the provider
  // picker — used on the session view, where a session's provider is fixed.
  allowCompose?: boolean;
  footerItems?: PromptComposerFooterItem[];
  branchFooterItem?: PromptComposerFooterItem;
  imageAttachments?: ComposerImageAttachment[];
  reviewCommentAttachments?: ComposerReviewCommentAttachment[];
  onAddImageAttachments?: (files: File[]) => void;
  onRemoveImageAttachment?: (id: string) => void;
  onRemoveReviewCommentAttachment?: (id: string) => void;
  pendingItems?: PendingConversationItem[];
  approvals?: ApprovalRequest[];
  onResolveApproval?: (approvalId: string, decision: ApprovalDecision) => void;
  // User messages queued behind the active run. Rendered as a collapsible
  // accordion above the input; each can be steered (run now), edited (unqueued
  // back into the draft), removed, or dragged to reprioritize.
  queuedMessages?: QueuedUserMessage[];
  onSteerQueued?: (queuedId: string) => void;
  onCancelQueued?: (queuedId: string) => void;
  onReorderQueued?: (orderedIds: string[]) => void;
  onEditQueued?: (queuedId: string, body: string) => void;
};

export type PromptComposerControls = Omit<ComposerProps, "pendingItems">;

export type PromptComposerFooterItem = {
  icon: ElementType;
  label: string;
  options?: PromptComposerFooterOption[];
  optionIcon?: ElementType;
  menuItems?: PromptComposerFooterMenuItem[];
  menuTitle?: string;
  menuPlacement?: "up" | "down";
  selectedOptionId?: string;
  searchPlaceholder?: string;
  showOptionDetails?: boolean;
  createLabel?: string;
  emptyLabel?: string;
  loading?: boolean;
  error?: string | null;
  onSelect?: (option: PromptComposerFooterOption) => void;
  onCreate?: (query: string) => void | Promise<void>;
  onUseExistingFolder?: () => void | Promise<void>;
  onOpen?: () => void;
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

const MAX_PROMPT_TEXTAREA_HEIGHT = 160;

export const startInFooterMenuItems: PromptComposerFooterMenuItem[] = [
  ...localWorkMenuBaseItems.slice(0, 1),
  {
    icon: GitPullRequestCreateArrow,
    label: "New worktree"
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
  composeAgentModels,
  setComposeAgentModel,
  intelligence,
  setIntelligence,
  composeAgentIntelligence,
  setComposeAgentIntelligence,
  permissionOpen,
  setPermissionOpen,
  intelligenceOpen,
  setIntelligenceOpen,
  permissionMenuId,
  intelligenceMenuId,
  provider,
  setProvider,
  allowCompose = true,
  value: valueProp,
  setValue: setValueProp,
  placeholder,
  textareaRows = 1,
  showAttachmentPill = true,
  submitMode = "stop",
  submitLabel = submitMode === "send" ? "Start session" : "Stop",
  onSubmit,
  onStop,
  submitDisabled = false,
  disabled = false,
  requireNonEmptyPrompt = false,
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
  const permissionMenuRef = useRef<HTMLDivElement>(null);
  const permissionButtonRef = useRef<HTMLButtonElement>(null);
  const intelligenceMenuRef = useRef<HTMLDivElement>(null);
  const intelligenceButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaWidthRef = useRef<number | null>(null);
  // Subscribe to the store-owned draft text here so typing re-renders this
  // component only. An explicit `value`/`setValue` prop (if provided) still
  // wins for backwards compatibility.
  const storePrompt = useComposerStore((state) => state.prompt);
  const storeSetPrompt = useComposerStore((state) => state.setPrompt);
  const value = valueProp ?? storePrompt;
  const setValue = setValueProp ?? storeSetPrompt;
  const effectiveSubmitDisabled =
    disabled ||
    submitDisabled ||
    (requireNonEmptyPrompt && value.trim().length === 0);
  const activeProvider = composerProvider(provider);
  const selectedModel = modelOption(activeProvider, model);
  const compactModelLabel = compactModelOptionLabel(selectedModel);

  function resizePromptTextarea() {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textareaWidthRef.current = textarea.clientWidth;
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, MAX_PROMPT_TEXTAREA_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > MAX_PROMPT_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }

  useLayoutEffect(() => {
    resizePromptTextarea();
  }, [textareaRows, value]);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (typeof ResizeObserver === "function" && textarea) {
      const observer = new ResizeObserver(() => {
        if (textareaWidthRef.current !== textarea.clientWidth) {
          resizePromptTextarea();
        }
      });
      observer.observe(textarea);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", resizePromptTextarea);
    return () => window.removeEventListener("resize", resizePromptTextarea);
  }, []);

  useEffect(() => {
    if (disabled) {
      setPermissionOpen(false);
      setIntelligenceOpen(false);
    }
  }, [disabled, setIntelligenceOpen, setPermissionOpen]);

  useEffect(() => {
    if (!selectedModel.efforts.includes(intelligence)) {
      setIntelligence(defaultEffort(selectedModel));
    }
  }, [intelligence, selectedModel, setIntelligence]);

  useEffect(() => {
    if (!permissionOpen && !intelligenceOpen) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (
        permissionOpen &&
        !permissionMenuRef.current?.contains(event.target) &&
        !permissionButtonRef.current?.contains(event.target)
      ) {
        setPermissionOpen(false);
      }

      if (
        intelligenceOpen &&
        !intelligenceMenuRef.current?.contains(event.target) &&
        !intelligenceButtonRef.current?.contains(event.target)
      ) {
        setIntelligenceOpen(false);
      }
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setPermissionOpen(false);
        setIntelligenceOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [intelligenceOpen, permissionOpen, setIntelligenceOpen, setPermissionOpen]);

  function addImageFiles(files: Iterable<File>) {
    if (disabled) {
      return;
    }

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
    if (disabled) {
      return;
    }

    if (Array.from(event.dataTransfer.items).some((item) => item.type.startsWith("image/"))) {
      event.preventDefault();
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }

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

    if (submitMode === "send") {
      if (!effectiveSubmitDisabled) {
        onSubmit();
      }
      return;
    }

    // While a run is active (submitMode === "stop"), Enter on a non-empty draft
    // queues the message instead of interrupting — the agent picks it up when
    // the current turn finishes. The Stop button stays available to interrupt.
    if (!submitDisabled && value.trim().length > 0) {
      onSubmit();
    }
  }

  return (
    <div
      data-composer-content
      className={`pointer-events-auto relative mx-auto w-full max-w-[820px] ${className}`}
      aria-disabled={disabled}
    >
      {intelligenceOpen && (
        <ModelSettingsMenu
          ref={intelligenceMenuRef}
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
          composeAgentModels={composeAgentModels}
          setComposeAgentModel={setComposeAgentModel}
          intelligence={intelligence}
          setIntelligence={(value) => {
            setIntelligence(value);
            setIntelligenceOpen(false);
          }}
          composeAgentIntelligence={composeAgentIntelligence}
          setComposeAgentIntelligence={setComposeAgentIntelligence}
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
          <div className="mb-2 flex max-w-full flex-wrap items-end gap-2">
            {imageAttachments.map((attachment) => (
              <ImageAttachmentPill
                key={attachment.id}
                attachment={attachment}
                onRemove={() => onRemoveImageAttachment?.(attachment.id)}
              />
            ))}
            {reviewCommentAttachments.length > 0 && (
              <ReviewCommentAttachmentGroup
                attachments={reviewCommentAttachments}
                onRemove={(id) => onRemoveReviewCommentAttachment?.(id)}
              />
            )}
          </div>
        )}
        <textarea
          ref={textareaRef}
          aria-label="Ask Composer"
          className="thin-scrollbar mt-0.5 min-h-7 w-full resize-none rounded-md bg-transparent px-1 text-[13px] leading-6 text-app-text outline-none placeholder:text-app-dim focus-visible:outline-none focus-visible:ring-0"
          placeholder={placeholder}
          rows={textareaRows}
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
          onPaste={handlePaste}
        />
        <div className="composer-action-row mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5">
          <div className="composer-left-controls flex min-w-0 flex-nowrap items-center gap-2 overflow-visible">
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept="image/*"
              multiple
              disabled={disabled}
              onChange={handleFileInputChange}
            />
            <TooltipButton
              className={subtleIconButton}
              aria-label="Attach"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              tooltip="Attach image"
              type="button"
            >
              <Plus size={17} />
            </TooltipButton>
            <div className="relative shrink-0">
              {permissionOpen && (
                <PermissionMenu
                  ref={permissionMenuRef}
                  id={permissionMenuId}
                  permission={permission}
                  setPermission={(nextPermission) => {
                    setPermission(nextPermission);
                    setPermissionOpen(false);
                  }}
                />
              )}
              <TooltipButton
                ref={permissionButtonRef}
                className={cn(
                  "composer-permission-button inline-flex h-[30px] min-w-0 max-w-[160px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[13px] transition-colors",
                  "border-transparent hover:border-[color:color-mix(in_srgb,var(--color-app-orange)_25%,transparent)]",
                  "bg-transparent",
                  appWarningText,
                  appWarningHoverSurface,
                  warningFocusRing
                )}
                disabled={disabled}
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
            </div>
            <ProviderDropdown
              provider={provider}
              setProvider={setProvider}
              allowCompose={allowCompose}
              disabled={disabled}
            />
          </div>

          <div className="composer-right-controls flex min-w-0 flex-nowrap items-center justify-end gap-2">
            <TooltipButton
              ref={intelligenceButtonRef}
              className={cn(
                "composer-model-button h-[30px] min-w-0 max-w-[164px] gap-1.5 px-2.5 text-[13px]",
                pillButton
              )}
              disabled={disabled}
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
              className={primaryIconButton}
              aria-label={submitLabel}
              disabled={effectiveSubmitDisabled}
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

      {footerItems.length > 0 && (
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
              showOptionDetails={item.showOptionDetails}
              optionIcon={item.optionIcon}
              searchPlaceholder={item.searchPlaceholder}
              createLabel={item.createLabel}
              emptyLabel={item.emptyLabel}
              loading={item.loading}
              error={item.error}
              onSelect={item.onSelect}
              onCreate={item.onCreate}
              onUseExistingFolder={item.onUseExistingFolder}
              onOpen={item.onOpen}
              disabled={disabled}
            />
          ))}
        </div>
      )}
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

function ReviewCommentAttachmentGroup({
  attachments,
  onRemove
}: {
  attachments: ComposerReviewCommentAttachment[];
  onRemove: (id: string) => void;
}) {
  const hiddenCount = Math.max(0, attachments.length - 3);

  return (
    <div className="group/comment relative inline-flex">
      <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-0 z-20 w-[min(760px,calc(100vw-64px))] translate-y-1 opacity-0 transition duration-150 group-hover/comment:pointer-events-auto group-hover/comment:translate-y-0 group-hover/comment:opacity-100 group-focus-within/comment:pointer-events-auto group-focus-within/comment:translate-y-0 group-focus-within/comment:opacity-100">
        <div className="grid gap-2">
          {attachments.slice(0, 3).map((attachment) => (
            <ReviewCommentAttachmentPreview
              key={attachment.id}
              attachment={attachment}
              onRemove={() => onRemove(attachment.id)}
            />
          ))}
          {hiddenCount > 0 && (
            <div className={cn("rounded-2xl px-5 py-3 text-[13px] text-app-muted", cardSurface)}>
              {hiddenCount} more comment{hiddenCount === 1 ? "" : "s"}
            </div>
          )}
        </div>
      </div>
      <div className={cn("inline-flex h-8 items-center gap-2 py-0.5 pl-3 pr-1 text-[14px] font-medium text-app-text", pillButton)}>
        <MessageSquare className="shrink-0 text-app-muted" size={15} />
        <span>
          {attachments.length} comment{attachments.length === 1 ? "" : "s"}
        </span>
        <TooltipButton
          className={cn(subtleIconButton, "ml-0.5 h-6 w-6")}
          aria-label="Remove review comments"
          onClick={() => {
            for (const attachment of attachments) {
              onRemove(attachment.id);
            }
          }}
          tooltip="Remove review comments"
          type="button"
        >
          <X size={15} />
        </TooltipButton>
      </div>
    </div>
  );
}

function ReviewCommentAttachmentPreview({
  attachment,
  onRemove
}: {
  attachment: ComposerReviewCommentAttachment;
  onRemove: () => void;
}) {
  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-2xl px-7 py-5 text-app-text shadow-2xl shadow-black/25", cardSurface)}>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-3 text-[15px]">
          <MessageSquare className="shrink-0 text-app-muted" size={17} />
          <span className="min-w-0 truncate font-medium text-app-accent">
            {attachment.filePath}
          </span>
          <span className="shrink-0 text-app-text">
            {attachment.side}
          </span>
          <span className="shrink-0 text-app-muted">
            {attachment.lineNumber}
          </span>
        </div>
        <div className="mt-4 whitespace-pre-wrap text-[16px] leading-6">
          {attachment.body}
        </div>
      </div>
      <TooltipButton
        className={cn(subtleIconButton, "mt-0.5 h-8 w-8")}
        aria-label={`Remove comment on ${attachment.filePath}`}
        onClick={onRemove}
        tooltip={`Remove comment on ${attachment.filePath}`}
        type="button"
      >
        <X size={17} />
      </TooltipButton>
    </div>
  );
}

export function Composer({
  pendingItems = [],
  layout = "overlay",
  footerItems,
  branchFooterItem,
  // The session-view composer never offers Compose (parallel) — a session's
  // provider is fixed. New-session uses <PromptComposer> directly (allowCompose
  // defaults to true there).
  allowCompose = false,
  queuedMessages = [],
  onSteerQueued,
  onCancelQueued,
  onReorderQueued,
  onEditQueued,
  ...controls
}: ComposerProps) {
  const showPendingTerminalStack = false;
  const resolvedFooterItems = footerItems ?? [
    {
      icon: Laptop,
      label: "Work locally",
      menuTitle: "Continue in",
      menuItems: continueInFooterMenuItems,
      menuPlacement: "up" as const
    },
    branchFooterItem ?? { icon: GitBranch, label: "main" }
  ];

  return (
    <div
      className={cn(
        "composer-fade pointer-events-none z-10 px-5 pb-4",
        layout === "overlay"
          ? "absolute inset-x-0 bottom-0 pt-10"
          : "relative pt-3"
      )}
    >
      <div className="pointer-events-auto relative mx-auto w-full max-w-[820px]">
        {showPendingTerminalStack && (
          <PendingTerminalStack
            items={pendingItems}
            approvals={controls.approvals ?? []}
            onResolveApproval={controls.onResolveApproval}
            onStop={controls.onStop}
          />
        )}
        <QueuedMessagesAccordion
          queuedMessages={queuedMessages}
          onSteer={onSteerQueued}
          onCancel={onCancelQueued}
          onReorder={onReorderQueued}
          onEdit={onEditQueued}
        />
        {/* z-10 so the composer card sits on top of the queue accordion, which
            tucks under it (the accordion uses a negative bottom margin). */}
        <div className="relative z-10">
          <PromptComposer
            {...controls}
            allowCompose={allowCompose}
            footerItems={resolvedFooterItems}
            placeholder="Ask Composer to build, debug, or review"
          />
        </div>
      </div>
    </div>
  );
}

// Collapsible stack of queued user messages shown above the composer input
// (Codex-style). Appears only when something is queued. Each row can be steered
// (interrupt + run now), edited (unqueued back into the draft), removed, or
// dragged to reprioritize. The queue auto-drains as turns complete.
function QueuedMessagesAccordion({
  queuedMessages,
  onSteer,
  onCancel,
  onReorder,
  onEdit
}: {
  queuedMessages: QueuedUserMessage[];
  onSteer?: (queuedId: string) => void;
  onCancel?: (queuedId: string) => void;
  onReorder?: (orderedIds: string[]) => void;
  onEdit?: (queuedId: string, body: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const count = queuedMessages.length;

  if (count === 0) {
    return null;
  }

  const handleDrop = (targetId: string) => {
    if (!onReorder || !dragId || dragId === targetId) {
      setDragId(null);
      return;
    }

    const ids = queuedMessages.map((message) => message.id);
    const next = ids.filter((id) => id !== dragId);
    const targetIndex = next.indexOf(targetId);
    next.splice(targetIndex < 0 ? next.length : targetIndex, 0, dragId);
    setDragId(null);

    if (ids.some((id, index) => id !== next[index])) {
      onReorder(next);
    }
  };

  return (
    // Tucks under the composer like a stacked disk: 96% of the composer width,
    // centered, rounded top, flat bottom, no bottom border, and a negative
    // bottom margin so the composer card (z-10) overlaps and hides its lower
    // edge. Extra bottom padding keeps the last row clear of the overlapped zone.
    <div className="relative z-0 mx-auto -mb-4 w-[96%] overflow-hidden rounded-t-2xl border border-b-0 border-app-line bg-app-panel pb-4 shadow-sm">
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-medium text-app-muted transition-colors hover:text-app-text"
      >
        <ListTree size={13} className="shrink-0" />
        <span className="flex-1 text-left">
          {count} queued {count === 1 ? "message" : "messages"}
        </span>
        <ChevronDown
          size={14}
          className={cn(
            "shrink-0 transition-transform",
            collapsed ? "-rotate-90" : "rotate-0"
          )}
        />
      </button>
      {!collapsed && (
        <ul className="flex flex-col gap-px border-t border-app-line/70 px-1.5 pb-1.5 pt-1.5">
          {queuedMessages.map((message) => (
            <li
              key={message.id}
              draggable={Boolean(onReorder)}
              onDragStart={() => setDragId(message.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(event) => {
                if (onReorder && dragId) {
                  event.preventDefault();
                }
              }}
              onDrop={() => handleDrop(message.id)}
              className={cn(
                "group flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-app-hover",
                dragId === message.id && "opacity-50"
              )}
            >
              <GripVertical
                size={14}
                className={cn(
                  "shrink-0 text-app-muted/50",
                  onReorder ? "cursor-grab active:cursor-grabbing" : ""
                )}
                aria-hidden="true"
              />
              <ProviderLogo provider={message.provider} className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-app-text">
                {message.body}
              </span>
              {onSteer && (
                <button
                  type="button"
                  onClick={() => onSteer(message.id)}
                  title="Interrupt the current run and send this now"
                  className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] text-app-muted opacity-0 transition-colors hover:bg-app-hover hover:text-app-text group-hover:opacity-100"
                >
                  <CornerDownRight size={13} />
                  Steer
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(message.id, message.body)}
                  title="Unqueue to edit"
                  aria-label="Unqueue to edit"
                  className="flex shrink-0 items-center rounded-md p-1 text-app-muted opacity-0 transition-colors hover:bg-app-hover hover:text-app-text group-hover:opacity-100"
                >
                  <Pencil size={13} />
                </button>
              )}
              {onCancel && (
                <button
                  type="button"
                  onClick={() => onCancel(message.id)}
                  title="Remove from queue"
                  aria-label="Remove from queue"
                  className="flex shrink-0 items-center rounded-md p-1 text-app-muted opacity-0 transition-colors hover:bg-app-danger/15 hover:text-app-danger group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const providerOptions = runtimeProviderDefinitions.map((definition) => ({
  value: definition.id,
  label: definition.label
})) satisfies Array<{ value: ComposerProvider; label: string }>;

const ComposerMenuSurface = forwardRef<
  HTMLDivElement,
  ComponentProps<"div">
>(function ComposerMenuSurface({ className, ...props }, ref) {
  // Routes the provider, permission, model-settings and footer menus through a
  // glass surface when liquid glass is enabled; otherwise the `menu` default is
  // the original `menuSurface` token, so the off-state is unchanged.
  return <GlassPanel ref={ref} variant="menu" className={className} {...props} />;
});

const ComposerMenuButton = forwardRef<
  HTMLButtonElement,
  ComponentProps<typeof TooltipButton> & { selected?: boolean }
>(function ComposerMenuButton({ className, selected, ...props }, ref) {
  return (
    <TooltipButton
      ref={ref}
      className={cn(
        menuItem,
        "px-2 py-1",
        className,
        selected && `${appActiveSurface} text-app-text`
      )}
      {...props}
    />
  );
});

function ComposerMenuDivider() {
  return <div className="my-1 h-px bg-app-line" />;
}

function ProviderDropdown({
  provider,
  setProvider,
  allowCompose = true,
  disabled = false
}: {
  provider: SessionProvider;
  setProvider: (value: SessionProvider) => void;
  allowCompose?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const visibleProvider: ComposerProvider = provider;
  // On the session view the parallel "Compose" provider is hidden — a session's
  // provider is fixed once it exists.
  const options = allowCompose
    ? providerOptions
    : providerOptions.filter((option) => option.value !== "meta");
  const selectedProvider =
    providerOptions.find((option) => option.value === visibleProvider) ??
    providerOptions[0];
  const menuId = "composer-provider-menu";

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  return (
    <div className="relative min-w-0 shrink-0">
      {open && (
        <ComposerMenuSurface
          id={menuId}
          className="absolute bottom-[38px] left-0 z-20 grid w-max max-w-[calc(100vw-48px)] gap-1"
          role="menu"
          aria-label="Provider"
        >
          {options.map(({ value, label }) => (
            <ComposerMenuButton
              key={value}
              className="grid min-h-7 grid-cols-[20px_minmax(0,1fr)_18px] items-center gap-2 text-[14px] text-app-text"
              selected={visibleProvider === value}
              onClick={() => {
                setProvider(value);
                setOpen(false);
              }}
              role="menuitemradio"
              aria-checked={visibleProvider === value}
              tooltip={`Switch to ${label}`}
              type="button"
            >
              <ProviderLogo provider={value} className="h-3.5 w-3.5" />
              <span className="composer-provider-menu-label truncate">
                {label}
              </span>
              {visibleProvider === value && <Check size={14} />}
            </ComposerMenuButton>
          ))}
        </ComposerMenuSurface>
      )}
      <TooltipButton
        className={cn(
          "composer-provider-button inline-flex h-[30px] min-w-0 max-w-[132px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[13px] text-app-text transition-colors",
          "border-transparent hover:border-app-line",
          "bg-transparent",
          appHoverSurface
        )}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        aria-label={`Provider: ${selectedProvider.label}`}
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        tooltip={`Provider: ${selectedProvider.label}`}
        type="button"
      >
        <ProviderLogo
          provider={selectedProvider.value}
          className="h-3.5 w-3.5"
        />
        <span className="composer-provider-label truncate">
          {selectedProvider.label}
        </span>
        <ChevronDown className="shrink-0" size={13} />
      </TooltipButton>
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
                <Shimmer as="span" className="truncate font-medium" duration={1.45} spread={3}>
                  {item.label}
                </Shimmer>
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

function menuWidthForLabels(labels: string[]) {
  const longest = labels.reduce(
    (max, label) => Math.max(max, label.trim().length),
    0
  );
  const widthCh = Math.max(16, Math.min(longest, 52));

  return `min(calc(${widthCh}ch + 88px), calc(100vw - 48px))`;
}

function ComposerFooterButton({
  icon: Icon,
  label,
  options,
  optionIcon: OptionIcon = Folder,
  menuItems,
  menuTitle,
  menuPlacement = "up",
  selectedOptionId,
  searchPlaceholder = "Search",
  showOptionDetails = true,
  createLabel = "New project",
  emptyLabel = "No projects found",
  loading = false,
  error: externalError,
  onSelect,
  onCreate,
  onUseExistingFolder,
  onOpen,
  disabled = false
}: {
  icon: ElementType;
  label: string;
  options?: PromptComposerFooterOption[];
  optionIcon?: ElementType;
  menuItems?: PromptComposerFooterMenuItem[];
  menuTitle?: string;
  menuPlacement?: "up" | "down";
  selectedOptionId?: string;
  searchPlaceholder?: string;
  showOptionDetails?: boolean;
  createLabel?: string;
  emptyLabel?: string;
  loading?: boolean;
  error?: string | null;
  onSelect?: (option: PromptComposerFooterOption) => void;
  onCreate?: (query: string) => void | Promise<void>;
  onUseExistingFolder?: () => void | Promise<void>;
  onOpen?: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [usingExistingFolder, setUsingExistingFolder] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createMenuPosition, setCreateMenuPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuMaxHeight, setMenuMaxHeight] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const addProjectButtonRef = useRef<HTMLButtonElement>(null);
  const hasCustomMenu = Boolean(menuItems?.length);
  const hasMenu = Boolean(
    hasCustomMenu ||
    options?.length ||
    onCreate ||
    onOpen ||
    loading ||
    externalError
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(
    () =>
      (options ?? []).filter((option) =>
        `${option.label} ${option.detail ?? ""} ${option.cwd ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery)
      ),
    [options, normalizedQuery]
  );
  const createActionLabel = query.trim()
    ? `Create "${query.trim()}"`
    : createLabel;
  const menuWidth = menuWidthForLabels(
    hasCustomMenu
      ? menuItems?.map((item) => item.label) ?? []
      : [
          searchPlaceholder,
          emptyLabel,
          createActionLabel,
          ...(options ?? []).flatMap((option) =>
            showOptionDetails && option.detail
              ? [option.label, option.detail]
              : [option.label]
          )
        ]
  );
  const menuStyle = {
    width: menuWidth,
    ...(menuMaxHeight === null ? {} : { maxHeight: `${menuMaxHeight}px` })
  };
  const createMenuWidth = menuWidthForLabels([
    creating ? "Creating project..." : "Start from scratch",
    usingExistingFolder ? "Opening folder..." : "Use an existing folder"
  ]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  function setCreateMenuPositionFromRect(rect: DOMRect) {
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const margin = 8;
    const gap = 8;
    const submenuWidth = 288;
    const submenuHeight = 112;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;
    const openRight = rect.right + gap + submenuWidth <= viewportRight - margin;
    const left = openRight
      ? rect.right + gap
      : Math.max(viewportLeft + margin, rect.left - gap - submenuWidth);
    const top = Math.min(
      Math.max(viewportTop + margin, rect.top - 6),
      viewportBottom - submenuHeight - margin
    );

    setCreateMenuPosition({ left: Math.round(left), top: Math.round(top) });
  }

  function openCreateMenuFromElement(element: HTMLElement) {
    setCreateMenuPositionFromRect(element.getBoundingClientRect());
    setCreateMenuOpen(true);
  }

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

  async function handleUseExistingFolder() {
    if (!onUseExistingFolder || usingExistingFolder) {
      return;
    }

    setUsingExistingFolder(true);
    setError(null);

    try {
      await onUseExistingFolder();
      setOpen(false);
    } catch (useExistingFolderError) {
      setError(
        useExistingFolderError instanceof Error
          ? useExistingFolderError.message
          : String(useExistingFolderError)
      );
    } finally {
      setUsingExistingFolder(false);
    }
  }

  useEffect(() => {
    if (!open) {
      setQuery("");
      setError(null);
      setMenuMaxHeight(null);
      setCreateMenuOpen(false);
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

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    function updateMenuMaxHeight() {
      const rect = menuRef.current?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const gap = 8;
      const margin = 16;
      const availableHeight =
        menuPlacement === "down"
          ? viewportTop + viewportHeight - rect.bottom - gap - margin
          : rect.top - viewportTop - gap - margin;

      setMenuMaxHeight(Math.max(180, Math.floor(availableHeight)));
    }

    updateMenuMaxHeight();
    window.addEventListener("resize", updateMenuMaxHeight);
    window.addEventListener("scroll", updateMenuMaxHeight, true);
    window.visualViewport?.addEventListener("resize", updateMenuMaxHeight);

    return () => {
      window.removeEventListener("resize", updateMenuMaxHeight);
      window.removeEventListener("scroll", updateMenuMaxHeight, true);
      window.visualViewport?.removeEventListener("resize", updateMenuMaxHeight);
    };
  }, [menuPlacement, open]);

  useLayoutEffect(() => {
    if (!open || !createMenuOpen) {
      setCreateMenuPosition(null);
      return;
    }

    function updateCreateMenuPosition() {
      const rect = addProjectButtonRef.current?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      setCreateMenuPositionFromRect(rect);
    }

    updateCreateMenuPosition();
    window.addEventListener("resize", updateCreateMenuPosition);
    window.addEventListener("scroll", updateCreateMenuPosition, true);
    window.visualViewport?.addEventListener("resize", updateCreateMenuPosition);
    window.visualViewport?.addEventListener("scroll", updateCreateMenuPosition);

    return () => {
      window.removeEventListener("resize", updateCreateMenuPosition);
      window.removeEventListener("scroll", updateCreateMenuPosition, true);
      window.visualViewport?.removeEventListener(
        "resize",
        updateCreateMenuPosition
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        updateCreateMenuPosition
      );
    };
  }, [createMenuOpen, open]);

  function toggleOpen() {
    if (disabled) {
      return;
    }

    const nextOpen = !open;

    setOpen(nextOpen);

    if (nextOpen) {
      onOpen?.();
    }
  }

  if (!hasMenu) {
    return (
      <TooltipButton
        className={cn(
          "composer-footer-button h-8 gap-1.5 px-2.5 text-[13px]",
          pillButton,
          "border-transparent bg-transparent text-app-dim shadow-none hover:bg-app-text/[0.06] hover:text-app-muted"
        )}
        aria-label={label}
        disabled={disabled}
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
        onClick={toggleOpen}
        disabled={disabled}
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
        <ComposerMenuSurface
          className={cn(
            "absolute left-0 z-30 flex max-w-[calc(100vw-48px)] flex-col overflow-visible text-[14px]",
            menuPlacement === "up"
              ? "bottom-[calc(100%+8px)]"
              : "top-[calc(100%+8px)]"
          )}
          style={menuStyle}
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
              <label className="grid h-9 shrink-0 grid-cols-[22px_minmax(0,1fr)] items-center gap-1 rounded-lg px-2 text-app-dim">
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

              <div className="min-h-0 flex-1 overflow-y-auto">
                {loading && filteredOptions.length === 0 && (
                  <div className="grid min-h-7 items-center px-2 text-[13px] text-app-dim">
                    Loading...
                  </div>
                )}

                {filteredOptions.map((option) => {
                  const selected = option.id === selectedOptionId;

                  return (
                    <ComposerMenuButton
                      key={option.id}
                      className="grid min-h-7 w-full grid-cols-[24px_minmax(0,max-content)_20px] items-center gap-2 text-app-text"
                      selected={selected}
                      onClick={() => {
                        onSelect?.(option);
                        setOpen(false);
                      }}
                      role="menuitemradio"
                      aria-checked={selected}
                      tooltip={`Select ${option.label}`}
                      type="button"
                    >
                      <OptionIcon className="text-app-muted" size={16} />
                      <span className="grid min-w-0 max-w-[calc(100vw-140px)]">
                        <span className="truncate">{option.label}</span>
                        {showOptionDetails && option.detail && (
                          <span className="truncate text-[12px] text-app-dim">
                            {option.detail}
                          </span>
                        )}
                      </span>
                      {selected && <Check size={15} />}
                    </ComposerMenuButton>
                  );
                })}

                {!loading && filteredOptions.length === 0 && (
                  <div className="grid min-h-7 items-center px-2 text-[13px] text-app-dim">
                    {emptyLabel}
                  </div>
                )}
              </div>

              {onCreate && (
                <>
                  <ComposerMenuDivider />
                  {onUseExistingFolder ? (
                    <div
                      className="relative shrink-0"
                      onMouseEnter={() => setCreateMenuOpen(true)}
                    >
                      <ComposerMenuButton
                        ref={addProjectButtonRef}
                        className="grid min-h-7 w-full grid-cols-[24px_minmax(0,1fr)_18px] items-center gap-2 text-app-text disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={creating || usingExistingFolder}
                        onClick={(event) =>
                          openCreateMenuFromElement(event.currentTarget)
                        }
                        onFocus={(event) =>
                          openCreateMenuFromElement(event.currentTarget)
                        }
                        onPointerEnter={(event) =>
                          openCreateMenuFromElement(event.currentTarget)
                        }
                        tooltip="Add new project"
                        type="button"
                      >
                        <Plus className="text-app-muted" size={16} />
                        <span className="truncate">Add new project</span>
                        <ChevronRight className="text-app-muted" size={16} />
                      </ComposerMenuButton>
                    </div>
                  ) : (
                    <ComposerMenuButton
                      className="grid min-h-7 w-full shrink-0 grid-cols-[24px_minmax(0,1fr)] items-center gap-2 text-app-text disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={creating}
                      onClick={() => void handleCreate()}
                      tooltip={creating ? "Creating project" : createActionLabel}
                      type="button"
                    >
                      <Plus className="text-app-muted" size={16} />
                      <span className="truncate">
                        {creating ? "Creating project..." : createActionLabel}
                      </span>
                    </ComposerMenuButton>
                  )}
                </>
              )}

              {(error || externalError) && (
                <div className={cn("shrink-0 px-2 pb-1 text-[12px]", appDangerText)}>
                  {error ?? externalError}
                </div>
              )}
            </>
          )}
        </ComposerMenuSurface>
      )}

      {open &&
        createMenuOpen &&
        onUseExistingFolder &&
        createMenuPosition && (
          <ComposerMenuSurface
            className="fixed z-50 grid max-w-[calc(100vw-48px)] gap-1 text-[14px]"
            style={{
              width: createMenuWidth,
              left: `${createMenuPosition.left}px`,
              top: `${createMenuPosition.top}px`
            }}
            role="menu"
            aria-label="Add new project"
            onMouseEnter={() => setCreateMenuOpen(true)}
          >
            <ComposerMenuButton
              className="grid min-h-7 w-full grid-cols-[24px_minmax(0,1fr)] items-center gap-2 text-app-text disabled:cursor-not-allowed disabled:opacity-60"
              disabled={creating}
              onClick={() => void handleCreate()}
              tooltip={creating ? "Creating project" : "Start from scratch"}
              type="button"
            >
              <Plus className="text-app-muted" size={16} />
              <span className="truncate">
                {creating ? "Creating project..." : "Start from scratch"}
              </span>
            </ComposerMenuButton>
            <ComposerMenuButton
              className="grid min-h-7 w-full grid-cols-[24px_minmax(0,1fr)] items-center gap-2 text-app-text disabled:cursor-not-allowed disabled:opacity-60"
              disabled={usingExistingFolder}
              onClick={() => void handleUseExistingFolder()}
              tooltip={
                usingExistingFolder
                  ? "Opening folder picker"
                  : "Use an existing folder"
              }
              type="button"
            >
              <Folder className="text-app-muted" size={16} />
              <span className="truncate">
                {usingExistingFolder ? "Opening folder..." : "Use an existing folder"}
              </span>
            </ComposerMenuButton>
          </ComposerMenuSurface>
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
      <div className="shrink-0 px-2 text-[14px] font-medium text-app-dim">
        {title}
      </div>
      <div className="grid min-h-0 gap-0.5 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const TrailingIcon =
            item.trailingIcon ?? (item.checked ? Check : undefined);

          return (
            <div key={item.label} className="grid gap-0.5">
              {item.separatorBefore && <ComposerMenuDivider />}
              <ComposerMenuButton
                className={cn(
                  "grid min-h-7 w-full grid-cols-[24px_minmax(0,1fr)_20px] items-center gap-2 text-[14px]",
                  item.disabled
                    ? "cursor-not-allowed text-app-dim/60"
                    : "text-app-text hover:bg-app-text/[0.06]"
                )}
                selected={item.checked}
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) {
                    return;
                  }

                  item.onSelect?.();
                  onClose();
                }}
                role="menuitemradio"
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
              </ComposerMenuButton>
            </div>
          );
        })}
      </div>
    </>
  );
}

const PermissionMenu = forwardRef<HTMLDivElement, {
  id: string;
  permission: PermissionMode;
  setPermission: (value: PermissionMode) => void;
}>(function PermissionMenu({
  id,
  permission,
  setPermission
}, ref) {
  const options: Array<[PermissionMode, ElementType]> = [
    ["Default permissions", Shield],
    ["Auto-review", ShieldCheck],
    ["Full access", ShieldAlert]
  ];

  return (
    <ComposerMenuSurface
      ref={ref}
      id={id}
      className="absolute bottom-[calc(100%+8px)] left-0 z-30 grid w-max max-w-[calc(100vw-48px)] gap-1"
      role="menu"
      aria-label="Permission mode"
    >
      {options.map(([label, Icon]) => (
        <ComposerMenuButton
          key={label}
          className="grid min-h-7 grid-cols-[20px_minmax(0,1fr)_18px] items-center gap-2 text-[14px] text-app-text"
          selected={permission === label}
          onClick={() => setPermission(label)}
          role="menuitemradio"
          aria-checked={permission === label}
          tooltip={`Select ${label}`}
        >
          <Icon size={14} />
          <span>{label}</span>
          {permission === label && <Check size={14} />}
        </ComposerMenuButton>
      ))}
    </ComposerMenuSurface>
  );
});

const ModelSettingsMenu = forwardRef<HTMLDivElement, {
  id: string;
  provider: ComposerProvider;
  model: AgentModel;
  setModel: (value: AgentModel) => void;
  composeAgentModels: Record<DelegateSessionProvider, AgentModel>;
  setComposeAgentModel: (
    provider: DelegateSessionProvider,
    value: AgentModel
  ) => void;
  intelligence: IntelligenceMode;
  setIntelligence: (value: IntelligenceMode) => void;
  composeAgentIntelligence: Record<DelegateSessionProvider, IntelligenceMode>;
  setComposeAgentIntelligence: (
    provider: DelegateSessionProvider,
    value: IntelligenceMode
  ) => void;
}>(function ModelSettingsMenu({
  id,
  provider,
  model,
  setModel,
  composeAgentModels,
  setComposeAgentModel,
  intelligence,
  setIntelligence,
  composeAgentIntelligence,
  setComposeAgentIntelligence
}, ref) {
  const [activeComposeAgent, setActiveComposeAgent] =
    useState<DelegateSessionProvider | null>(null);
  const models = providerModelOptions(provider);
  const selectedModel = modelOption(provider, model);
  const efforts = selectedModel.efforts;
  const label = providerLabel(provider);
  const effortLabel =
    provider === "meta"
      ? "Agent threads"
      : provider === "codex"
        ? "Reasoning effort"
        : "Thinking effort";
  const activeComposeModel = activeComposeAgent
    ? modelOption(activeComposeAgent, composeAgentModels[activeComposeAgent])
    : null;
  const activeComposeEffort = activeComposeAgent
    ? composeAgentIntelligence[activeComposeAgent]
    : null;
  const activeComposeEffortLabel =
    activeComposeAgent === "claude" ? "Thinking effort" : "Reasoning effort";
  const composeAgents: DelegateSessionProvider[] = ["codex", "claude"];

  return (
    <ComposerMenuSurface
      ref={ref}
      id={id}
      className={cn(
        "absolute -right-2 bottom-[64px] z-20 grid w-max max-w-[calc(100vw-48px)] gap-1 overflow-visible",
        provider === "meta" && "w-[340px]"
      )}
      role="menu"
      aria-label={`${label} model settings`}
    >
      <div className="grid gap-1">
        <div className="px-2 text-[14px] text-app-muted">
          {label} model
        </div>
        {models.map((option) => (
          <ComposerMenuButton
            key={option.value}
            className="grid min-h-7 grid-cols-[minmax(0,max-content)_18px] items-center text-[14px] text-app-text"
            selected={selectedModel.value === option.value}
            onClick={() => setModel(option.value)}
            role="menuitemradio"
            aria-checked={selectedModel.value === option.value}
            tooltip={`Select ${option.label}`}
          >
            <span className="grid min-w-0">
              <span className="truncate">{option.label}</span>
              <span className="max-w-[calc(100vw-140px)] truncate text-[12px] text-app-dim">
                {option.detail}
              </span>
            </span>
            {selectedModel.value === option.value && <Check size={14} />}
          </ComposerMenuButton>
        ))}
        <ComposerMenuDivider />
        <div className="px-2 text-[14px] text-app-muted">
          {effortLabel}
        </div>
        {provider === "meta" ? (
          <div className="grid gap-1">
            {composeAgents.map((agent) => {
              const agentModel = modelOption(agent, composeAgentModels[agent]);
              const agentEffort = composeAgentIntelligence[agent];

              return (
                <ComposerMenuButton
                  key={agent}
                  className="grid min-h-7 grid-cols-[20px_minmax(0,1fr)_18px] items-center gap-2 text-[14px] text-app-text"
                  selected={activeComposeAgent === agent}
                  onClick={() => setActiveComposeAgent(agent)}
                  onFocus={() => setActiveComposeAgent(agent)}
                  onMouseEnter={() => setActiveComposeAgent(agent)}
                  onPointerEnter={() => setActiveComposeAgent(agent)}
                  role="menuitem"
                  tooltip={`Configure ${providerLabel(agent)}`}
                >
                  <ProviderLogo provider={agent} className="h-[15px] w-[15px]" />
                  <span className="grid min-w-0">
                    <span className="truncate">{providerLabel(agent)}</span>
                    <span className="truncate text-[12px] text-app-dim">
                      {agentModel.label} · {agentEffort}
                    </span>
                  </span>
                  <ChevronRight size={14} />
                </ComposerMenuButton>
              );
            })}
          </div>
        ) : (
          efforts.map((label) => (
            <ComposerMenuButton
              key={label}
              className="grid min-h-7 grid-cols-[minmax(0,max-content)_18px] items-center text-[14px] text-app-text"
              selected={intelligence === label}
              onClick={() => setIntelligence(label)}
              role="menuitemradio"
              aria-checked={intelligence === label}
              tooltip={`Set ${effortLabel}: ${label}`}
            >
              <span>{label}</span>
              {intelligence === label && <Check size={14} />}
            </ComposerMenuButton>
          ))
        )}
      </div>
      {provider === "meta" &&
        activeComposeAgent &&
        activeComposeModel &&
        activeComposeEffort && (
        <ComposerMenuSurface
          className="absolute bottom-0 right-[calc(100%+8px)] z-10 grid w-[300px] max-w-[calc(100vw-48px)] gap-1"
          role="menu"
          aria-label={`${providerLabel(activeComposeAgent)} settings`}
          onMouseEnter={() => setActiveComposeAgent(activeComposeAgent)}
        >
          <div className="grid grid-cols-[20px_minmax(0,1fr)] items-center gap-2 px-2 text-[14px] text-app-text">
            <ProviderLogo
              provider={activeComposeAgent}
              className="h-[15px] w-[15px]"
            />
            <span className="truncate">
              {providerLabel(activeComposeAgent)}
            </span>
          </div>
          <div className="px-2 text-[12px] text-app-dim">
            Model
          </div>
          {providerModelOptions(activeComposeAgent).map((option) => (
            <ComposerMenuButton
              key={option.value}
              className="grid min-h-7 grid-cols-[minmax(0,1fr)_18px] items-center text-[14px] text-app-text"
              selected={activeComposeModel.value === option.value}
              onClick={() => {
                setComposeAgentModel(activeComposeAgent, option.value);

                if (!option.efforts.includes(activeComposeEffort)) {
                  setComposeAgentIntelligence(
                    activeComposeAgent,
                    defaultEffort(option)
                  );
                }
              }}
              role="menuitemradio"
              aria-checked={activeComposeModel.value === option.value}
              tooltip={`Set ${providerLabel(activeComposeAgent)} model: ${option.label}`}
            >
              <span className="grid min-w-0">
                <span className="truncate">{option.label}</span>
                <span className="truncate text-[12px] text-app-dim">
                  {option.detail}
                </span>
              </span>
              {activeComposeModel.value === option.value && <Check size={14} />}
            </ComposerMenuButton>
          ))}
          <ComposerMenuDivider />
          <div className="px-2 text-[12px] text-app-dim">
            {activeComposeEffortLabel}
          </div>
          {activeComposeModel.efforts.map((label) => (
            <ComposerMenuButton
              key={label}
              className="grid min-h-7 grid-cols-[minmax(0,max-content)_18px] items-center text-[14px] text-app-text"
              selected={activeComposeEffort === label}
              onClick={() =>
                setComposeAgentIntelligence(activeComposeAgent, label)
              }
              role="menuitemradio"
              aria-checked={activeComposeEffort === label}
              tooltip={`Set ${providerLabel(activeComposeAgent)} ${activeComposeEffortLabel}: ${label}`}
            >
              <span>{label}</span>
              {activeComposeEffort === label && <Check size={14} />}
            </ComposerMenuButton>
          ))}
        </ComposerMenuSurface>
      )}
    </ComposerMenuSurface>
  );
});

function modelOption(provider: ComposerProvider, value: AgentModel) {
  return providerModelOption(provider, value);
}

function compactModelOptionLabel(option: ProviderModelOption) {
  if (option.value.startsWith("gpt-")) {
    return option.label.replace(/^GPT-/, "");
  }

  if (option.value.includes("sonnet")) {
    return option.label.replace(/^Claude /, "");
  }

  if (option.value.includes("opus")) {
    return option.label.replace(/^Claude /, "");
  }

  if (option.value.startsWith("meta-")) {
    return option.label;
  }

  return option.label;
}

function defaultEffort(option: ProviderModelOption) {
  return option.efforts.includes("High")
    ? "High"
    : option.efforts[option.efforts.length - 1];
}
