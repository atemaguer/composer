import {
  createContext,
  Fragment,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode
} from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { create } from "zustand";
import {
  Anchor,
  ArrowDown,
  ArrowRight,
  ChevronDown,
  Check,
  Copy,
  ExternalLink,
  History,
  Maximize2,
  Pencil,
  Square,
  TerminalSquare,
  X
} from "lucide-react";

import { cn } from "../lib/cn";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
  getAttachmentLabel,
  getMediaCategory
} from "@/components/ai-elements/attachments";
import { MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type {
  ConversationAttachment,
  ConversationItem,
  DelegateSessionProvider,
  FileChangeRow,
  PendingConversationItem,
  ReviewDiffFile,
  SessionHandoffSummary,
  SessionProvider,
  ToolDetail
} from "../types";
import { canDelegateProvider, providerLabel } from "../provider-registry";
import { useOnboardingStore } from "../state/onboarding-store";
import { Composer, type ComposerProps } from "./Composer";
import { DiffView } from "./DiffView";
import { ProviderLogo } from "./ProviderLogo";
import {
  appAccentHoverText,
  appAccentText,
  appDangerSoftText,
  appDangerText,
  appHoverSurfaceSubtle,
  appOverlaySurface,
  appSoftSurface,
  appSuccessText,
  cardSurface,
  dimIcon,
  focusRing,
  subtleCardSurface,
  subtleIconButton
} from "./style-tokens";
import { TooltipButton } from "./ui/tooltip-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const markdownLinkText = "text-[#b7c3ff] hover:text-[#cbd4ff]";

// Persistent expand/collapse state keyed by a stable item/detail id. It lives
// OUTSIDE the component tree so a row's disclosure survives unmount/remount
// under list virtualization (P1-1) — collapsing/expanding a tool group, detail
// row or file-change card no longer snaps back to its default when the row
// scrolls out of and back into the virtualized viewport. Per-id selectors mean
// only the toggled row re-renders.
const useDisclosureStore = create<{
  overrides: Record<string, boolean>;
  toggle: (id: string, current: boolean) => void;
}>((set) => ({
  overrides: {},
  toggle: (id, current) =>
    set((state) => ({ overrides: { ...state.overrides, [id]: !current } }))
}));

function usePersistentDisclosure(
  id: string,
  defaultOpen: boolean
): [boolean, () => void] {
  const stored = useDisclosureStore((state) => state.overrides[id]);
  const open = stored ?? defaultOpen;
  const toggle = useCallback(
    () => useDisclosureStore.getState().toggle(id, open),
    [id, open]
  );

  return [open, toggle];
}

type ConversationProps = {
  className?: string;
  cwd?: string;
  inspectorOpen: boolean;
  items: ConversationItem[];
  pendingItems: PendingConversationItem[];
  transcriptLoading?: boolean;
  composer: ComposerProps;
  parallelAdoption?: ParallelAdoptionControls;
  handoffSummaries?: SessionHandoffSummary[];
  onOpenFile?: (filePath: string) => void;
  onReviewChanges?: (request?: ReviewChangeRequest) => void;
};

// Dev-only: correlates each handoff timeline marker (by item id) with the
// SessionHandoffSummary that was passed to the next agent, so hovering a marker
// can surface the handoff context. Empty in production.
const HandoffSummaryContext = createContext<Map<string, SessionHandoffSummary>>(
  new Map()
);

type ParallelAdoptionControls = {
  required: boolean;
  selectedProvider?: DelegateSessionProvider;
  onAdopt: (provider: DelegateSessionProvider) => void;
};

type ReviewChangeRequest = {
  filePath?: string;
  files?: ReviewDiffFile[];
};

export function Conversation({
  className,
  cwd,
  items,
  pendingItems,
  transcriptLoading = false,
  composer,
  parallelAdoption,
  handoffSummaries = [],
  onOpenFile,
  onReviewChanges
}: ConversationProps) {
  const stableGroupCacheRef = useRef<Map<string, StableGroupCacheEntry>>(
    new Map()
  );
  const timelineItems = useMemo(
    () =>
      stabilizeTimelineItems(
        groupParallelThreadActivity(
          groupConsecutiveToolActivity(
            items.filter(
              (item) => item.type !== "jump_marker" && !isParallelSupervisorMessage(item)
            )
          )
        ),
        stableGroupCacheRef.current
      ),
    [items]
  );
  // Pair handoff markers with their summaries in chronological order (best
  // effort) so the dev-mode marker tooltip can show the context that was passed.
  const handoffSummaryByItemId = useMemo(() => {
    const map = new Map<string, SessionHandoffSummary>();
    if (!handoffSummaries.length) {
      return map;
    }
    timelineItems
      .filter(isHandoffToolGroup)
      .forEach((item, index) => {
        const summary = handoffSummaries[index];
        if (summary) {
          map.set(item.id, summary);
        }
      });
    return map;
  }, [timelineItems, handoffSummaries]);
  const activeToolLabels = useMemo(
    () =>
      pendingItems
        .filter((item) => item.status === "running")
        .map((item) => item.label),
    [pendingItems]
  );
  const activeToolId = useMemo(
    () =>
      pendingItems.some((item) => item.status === "running")
        ? latestToolGroupId(timelineItems)
        : undefined,
    [pendingItems, timelineItems]
  );
  const hasRunningHandoff = useMemo(
    () =>
      timelineItems.some(
        (item) =>
          item.type === "tool_group" &&
          isHandoffToolGroup(item) &&
          item.status === "running"
      ),
    [timelineItems]
  );
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const jumpRafRef = useRef<number | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const hasPendingWork = pendingItems.length > 0;
  const showThinkingIndicator =
    hasPendingWork && !hasRunningHandoff && !hasOutputAfterLatestUser(items);

  const updateJumpVisibility = useCallback(() => {
    const scroller = scrollerRef.current;

    if (!scroller) {
      setShowJumpToLatest(false);
      return;
    }

    const distanceFromBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    const threshold = Math.min(700, Math.max(360, scroller.clientHeight * 0.55));

    setShowJumpToLatest(distanceFromBottom > threshold);
  }, []);

  // rAF-coalesce scroll-driven layout reads (P2-2): keep the isAtBottom ref in
  // sync and only flip the jump-to-latest control once per frame.
  const handleScroll = useCallback(() => {
    if (jumpRafRef.current !== null) {
      return;
    }

    jumpRafRef.current = requestAnimationFrame(() => {
      jumpRafRef.current = null;
      updateJumpVisibility();
    });
  }, [updateJumpVisibility]);

  useEffect(
    () => () => {
      if (jumpRafRef.current !== null) {
        cancelAnimationFrame(jumpRafRef.current);
      }
    },
    []
  );

  const handleAtBottomStateChange = useCallback(() => {
    updateJumpVisibility();
  }, [updateJumpVisibility]);

  // Only stick to the bottom while the user is pinned there (P1-4); Virtuoso
  // passes the current pinned state, so a scrolled-up user is never yanked down.
  // Use "auto" (instant) rather than "smooth": during token streaming the
  // smooth animation can't keep up with rapid appends and visibly lags/fights
  // the updates. The explicit Jump-to-latest button keeps its smooth behavior.
  const followOutput = useCallback(
    (atBottom: boolean): "auto" | false => (atBottom ? "auto" : false),
    []
  );

  const scrollToLatest = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: "LAST",
      align: "end",
      behavior: "smooth"
    });
  }, []);

  const renderItem = useCallback(
    (index: number, item: ConversationItem) => (
      <div className="px-5">
        <div
          data-conversation-content
          className={cn(
            "mx-auto w-full max-w-[820px]",
            index === 0 ? "pt-7" : "pt-5"
          )}
        >
          <ConversationItemView
            item={item}
            cwd={cwd}
            activeToolLabels={activeToolLabels}
            activeToolId={activeToolId}
            hasPendingWork={hasPendingWork}
            parallelAdoption={parallelAdoption}
            onOpenFile={onOpenFile}
            onReviewChanges={onReviewChanges}
          />
        </div>
      </div>
    ),
    [
      cwd,
      activeToolLabels,
      activeToolId,
      hasPendingWork,
      parallelAdoption,
      onOpenFile,
      onReviewChanges
    ]
  );

  const Footer = useCallback(
    () => (
      <div className="px-5 pb-[220px]">
        <div className="mx-auto w-full max-w-[820px]">
          {showThinkingIndicator && <ThinkingIndicator />}
        </div>
      </div>
    ),
    [showThinkingIndicator]
  );

  return (
    <HandoffSummaryContext.Provider value={handoffSummaryByItemId}>
    <section
      className={cn(
        "relative grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden",
        className
      )}
      aria-label="Agent conversation"
    >
      <div className="relative min-h-0">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-9 bg-gradient-to-t from-app-shell via-app-shell/70 to-app-shell/0" />
        {timelineItems.length === 0 ? (
          <div className="thin-scrollbar h-full overflow-auto px-5 pb-[220px] pt-4">
            <div data-conversation-content className="mx-auto w-full max-w-[820px]">
              {transcriptLoading && <TranscriptLoadingState />}
              {showThinkingIndicator && <ThinkingIndicator />}
            </div>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={timelineItems}
            initialTopMostItemIndex={Math.max(0, timelineItems.length - 1)}
            className="thin-scrollbar h-full"
            scrollerRef={(element) => {
              scrollerRef.current =
                element instanceof HTMLElement ? element : null;
            }}
            computeItemKey={(_index, item) => item.id}
            itemContent={renderItem}
            components={{ Footer }}
            followOutput={followOutput}
            // The Footer reserves 220px of composer clearance INSIDE the scroller,
            // so it counts toward scrollHeight. The threshold must exceed that
            // clearance, otherwise Virtuoso never considers the last real item
            // "at bottom" and followOutput stops sticking during streaming. 240px
            // = 220px footer + headroom for the thinking indicator.
            atBottomThreshold={240}
            atBottomStateChange={handleAtBottomStateChange}
            onScroll={handleScroll}
            increaseViewportBy={{ top: 1200, bottom: 1200 }}
          />
        )}
      </div>

      {showJumpToLatest && (
        <JumpToLatestOverlay
          hasPendingWork={hasPendingWork}
          onJump={scrollToLatest}
        />
      )}
      <Composer {...composer} pendingItems={pendingItems} footerItems={[]} />
    </section>
    </HandoffSummaryContext.Provider>
  );
}

type ToolGroupItem = Extract<ConversationItem, { type: "tool_group" }>;

type StableGroupCacheEntry = {
  signature: string;
  value: ConversationItem;
};

// Grouping (groupConsecutiveToolActivity / groupParallelThreadActivity) rebuilds
// merged objects on every `items` change, handing each grouped item a brand new
// identity even when its source content is unchanged. That defeats the
// React.memo on the row components and forces every Streamdown instance to
// re-render. Re-use the previous object whenever a freshly grouped item is
// structurally identical to what we produced last time, so unchanged history
// keeps a stable reference and only the streaming tail recomputes. (P1-3)
function stabilizeTimelineItems(
  grouped: ConversationItem[],
  cache: Map<string, StableGroupCacheEntry>
): ConversationItem[] {
  const nextCache = new Map<string, StableGroupCacheEntry>();
  const stabilized = grouped.map((item) => {
    const signature = JSON.stringify(item);
    const previous = cache.get(item.id);

    if (previous && previous.signature === signature) {
      nextCache.set(item.id, previous);
      return previous.value;
    }

    nextCache.set(item.id, { signature, value: item });
    return item;
  });

  cache.clear();
  for (const [id, entry] of nextCache) {
    cache.set(id, entry);
  }

  return stabilized;
}

function TranscriptLoadingState() {
  return (
    <div className="mx-auto grid w-full max-w-[820px] gap-6 pt-4">
      <Shimmer as="span" className="w-fit text-[14px] font-medium text-app-muted" duration={1.6} spread={3}>
        Loading session
      </Shimmer>
      <div className="grid gap-4">
        <div className="ml-auto grid w-full max-w-[520px] justify-items-end gap-2">
          <div className="h-12 w-[min(100%,460px)] rounded-2xl bg-app-panel/80" />
          <div className="h-3 w-16 rounded-full bg-app-text/[0.07]" />
        </div>
        <div className="grid max-w-[720px] gap-3">
          <div className="h-4 w-4/5 rounded-full bg-app-text/[0.08]" />
          <div className="h-4 w-full rounded-full bg-app-text/[0.07]" />
          <div className="h-4 w-2/3 rounded-full bg-app-text/[0.06]" />
        </div>
        <div className="grid max-w-[520px] gap-2">
          <div className="h-5 w-56 rounded-full bg-app-text/[0.07]" />
          <div className="h-5 w-72 rounded-full bg-app-text/[0.055]" />
        </div>
      </div>
    </div>
  );
}

function isHandoffToolGroup(item: ConversationItem) {
  if (item.type !== "tool_group") {
    return false;
  }

  const text = normalizeToolMatchText([
    item.summary,
    ...item.details.flatMap((detail) => [detail.label, detail.toolName])
  ]);

  return (
    /\bpreparing handoff context\b/.test(text) ||
    /\bcompacting context for handoff\b/.test(text) ||
    /\bgenerating readable handoff summary\b/.test(text)
  );
}

function groupConsecutiveToolActivity(
  items: ConversationItem[],
  options: { includeLayoutGroups?: boolean } = {}
): ConversationItem[] {
  const grouped: ConversationItem[] = [];
  let index = 0;

  while (index < items.length) {
    const item = items[index];

    if (isHandoffToolGroup(item)) {
      grouped.push(item);
      index += 1;
      continue;
    }

    if (
      item.type !== "tool_group" ||
      (item.layoutGroupId && !options.includeLayoutGroups)
    ) {
      grouped.push(item);
      index += 1;
      continue;
    }

    const batch: ToolGroupItem[] = [];

    while (
      items[index]?.type === "tool_group" &&
      !isHandoffToolGroup(items[index]) &&
      (!(items[index] as ToolGroupItem).layoutGroupId || options.includeLayoutGroups)
    ) {
      batch.push(items[index] as ToolGroupItem);
      index += 1;
    }

    grouped.push(batch.length === 1 ? batch[0] : mergeToolActivityBatch(batch));
  }

  return grouped;
}

function hasOutputAfterLatestUser(items: ConversationItem[]) {
  let latestUserIndex = -1;

  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index].type === "user_message") {
      latestUserIndex = index;
      break;
    }
  }

  if (latestUserIndex === -1) {
    return items.some(isStreamOutputItem);
  }

  return items.slice(latestUserIndex + 1).some(isStreamOutputItem);
}

function latestToolGroupId(items: ConversationItem[]): string | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];

    if (item.type === "tool_group" && !isHandoffToolGroup(item)) {
      return item.id;
    }

    if (item.type === "parallel_thread_group") {
      for (let columnIndex = item.columns.length - 1; columnIndex >= 0; columnIndex -= 1) {
        const id = latestToolGroupId(item.columns[columnIndex].items);

        if (id) {
          return id;
        }
      }
    }
  }

  return undefined;
}

function isStreamOutputItem(item: ConversationItem) {
  return (
    item.type === "assistant_message" ||
    (item.type === "tool_group" && !isHandoffToolGroup(item)) ||
    item.type === "parallel_thread_group" ||
    item.type === "file_change_summary" ||
    item.type === "notice" ||
    item.type === "turn_status"
  );
}

function isParallelSupervisorMessage(item: ConversationItem) {
  if (item.type !== "assistant_message") {
    return false;
  }

  return /\*\*compose supervisor\*\*/i.test(item.body) &&
    /\bparallel\b/i.test(item.body);
}

function ThinkingIndicator({ contained = false }: { contained?: boolean }) {
  return (
    <div
      className={cn(
        "grid w-full gap-2 text-[14px] text-app-muted",
        contained ? "pt-1" : "mx-auto mt-4 max-w-[820px]"
      )}
    >
      <Shimmer as="span" className="w-fit font-medium" duration={1.6} spread={3}>
        Thinking
      </Shimmer>
    </div>
  );
}

type ParallelThreadItem = Extract<
  ConversationItem,
  { type: "assistant_message" | "tool_group" }
>;

type ParallelThreadGroupItem = Extract<
  ConversationItem,
  { type: "parallel_thread_group" }
>;

function groupParallelThreadActivity(
  items: ConversationItem[]
): ConversationItem[] {
  const grouped: ConversationItem[] = [];
  let index = 0;
  let fallbackGroupIndex = 0;
  let lastUserPrompt: string | undefined;

  while (index < items.length) {
    const item = items[index];

    if (item.type === "user_message") {
      lastUserPrompt = item.body;
    }

    const layoutGroupId =
      parallelLayoutGroupId(item) ??
      (isParallelThreadMarker(item) ? `parallel-fallback-${fallbackGroupIndex++}` : undefined);

    if (!layoutGroupId) {
      grouped.push(item);
      index += 1;
      continue;
    }

    const batch: ParallelThreadItem[] = [];
    let activeFallbackProvider: SessionProvider | undefined;
    const isFallbackGroup = layoutGroupId.startsWith("parallel-fallback-");

    while (
      index < items.length &&
      belongsToParallelGroup(items[index], layoutGroupId, batch, activeFallbackProvider)
    ) {
      const normalized = normalizeParallelThreadItem(
        items[index] as ParallelThreadItem,
        activeFallbackProvider,
        isFallbackGroup
      );

      activeFallbackProvider = normalized.provider ?? activeFallbackProvider;
      batch.push(normalized);
      index += 1;
    }

    const parallelGroup = parallelThreadGroup(layoutGroupId, batch, lastUserPrompt);

    if (parallelGroup) {
      grouped.push(parallelGroup);
    } else {
      // Columns only form once two providers are present. Until then (or if only
      // one delegate ever produces output), keep every real item but drop the
      // internal delegate scaffolding so the markers never render raw.
      for (const batchItem of batch) {
        if (!isParallelDelegateWrapper(batchItem)) {
          grouped.push(batchItem);
        }
      }
    }
  }

  return grouped;
}

function parallelLayoutGroupId(item: ConversationItem) {
  if (isHandoffToolGroup(item)) {
    return undefined;
  }

  if (item.type === "assistant_message" || item.type === "tool_group") {
    return item.layoutGroupId;
  }

  return undefined;
}

function belongsToParallelGroup(
  item: ConversationItem,
  layoutGroupId: string,
  currentBatch: ParallelThreadItem[],
  activeFallbackProvider?: SessionProvider
) {
  const itemLayoutGroupId = parallelLayoutGroupId(item);

  if (itemLayoutGroupId) {
    return itemLayoutGroupId === layoutGroupId;
  }

  if (!layoutGroupId.startsWith("parallel-fallback-")) {
    return false;
  }

  if (!isParallelThreadItem(item)) {
    return false;
  }

  if (isParallelThreadMarker(item)) {
    return true;
  }

  return currentBatch.some(isParallelThreadMarker) &&
    Boolean(parallelItemProvider(item, currentBatch, activeFallbackProvider));
}

function isParallelThreadItem(item: ConversationItem): item is ParallelThreadItem {
  return item.type === "assistant_message" ||
    (item.type === "tool_group" && !isHandoffToolGroup(item));
}

function isParallelThreadMarker(item: ConversationItem) {
  return /(?:codex|claude) parallel delegate/i.test(parallelItemText(item));
}

function normalizeParallelThreadItem(
  item: ParallelThreadItem,
  activeFallbackProvider?: SessionProvider,
  forceFallbackProvider = false
): ParallelThreadItem {
  const provider = parallelItemProvider(
    item,
    [],
    activeFallbackProvider,
    forceFallbackProvider
  );

  return {
    ...item,
    provider,
    layoutTitle: item.layoutTitle ?? (provider ? `${providerLabel(provider)} thread` : undefined)
  };
}

function parallelItemProvider(
  item: ParallelThreadItem,
  currentBatch: ParallelThreadItem[] = [],
  activeFallbackProvider?: SessionProvider,
  forceFallbackProvider = false
): SessionProvider | undefined {
  const text = parallelItemText(item);

  if (/\bcodex\b/i.test(text)) {
    return "codex";
  }

  if (/\bclaude\b/i.test(text)) {
    return "claude";
  }

  if (forceFallbackProvider && isDelegateProvider(activeFallbackProvider)) {
    return activeFallbackProvider;
  }

  if (item.provider && item.provider !== "meta") {
    return item.provider;
  }

  if (isDelegateProvider(activeFallbackProvider)) {
    return activeFallbackProvider;
  }

  return [...currentBatch]
    .reverse()
    .map((batchItem) => batchItem.provider)
    .find((provider): provider is SessionProvider => isDelegateProvider(provider));
}

function parallelItemText(item: ConversationItem) {
  if (item.type === "assistant_message") {
    return item.body;
  }

  if (item.type === "tool_group") {
    return [
      item.summary,
      ...item.details.flatMap((detail) => [
        detail.label,
        detail.toolName,
        detail.args?.provider
      ])
    ].filter(Boolean).join(" ");
  }

  return "";
}

function parallelThreadGroup(
  layoutGroupId: string,
  items: ParallelThreadItem[],
  prompt?: string
): ParallelThreadGroupItem | null {
  const expandedItems = items.flatMap(splitParallelItemByProvider);
  const providers = Array.from(
    new Set(
      expandedItems
        .map((item) => item.provider)
        .filter((provider): provider is SessionProvider => Boolean(provider))
    )
  );

  if (providers.length < 2) {
    return null;
  }

  const providerOrder: SessionProvider[] = ["codex", "claude", "meta"];

  return {
    id: `parallel-${layoutGroupId}`,
    type: "parallel_thread_group",
    prompt,
    columns: providers
      .sort((left, right) => providerOrder.indexOf(left) - providerOrder.indexOf(right))
      .map((provider) => {
        const providerItems = expandedItems.filter((item) => item.provider === provider);

        return {
          provider,
          title:
            providerItems.find((providerItem) => providerItem.layoutTitle)?.layoutTitle ??
            `${providerLabel(provider)} thread`,
          items: providerItems
        };
      })
  };
}

function splitParallelItemByProvider(item: ParallelThreadItem): ParallelThreadItem[] {
  if (item.type !== "tool_group") {
    return [item];
  }

  const detailGroups = new Map<SessionProvider, ToolDetail[]>();
  const fallbackProvider = isDelegateProvider(item.provider)
    ? item.provider
    : undefined;

  for (const detail of item.details) {
    const provider = parallelDetailProvider(detail) ?? fallbackProvider;

    if (!provider) {
      continue;
    }

    detailGroups.set(provider, [...(detailGroups.get(provider) ?? []), detail]);
  }

  if (detailGroups.size <= 1) {
    return [item];
  }

  return Array.from(detailGroups.entries()).map(([provider, details]) => ({
    ...item,
    id: `${item.id}-${provider}`,
    provider,
    summary: summarizeParallelToolDetails(details),
    details,
    layoutTitle: `${providerLabel(provider)} thread`
  }));
}

function parallelDetailProvider(detail: ToolDetail): SessionProvider | undefined {
  const provider = detail.args?.provider?.toLowerCase();

  if (provider === "codex" || provider === "claude") {
    return provider;
  }

  const labelMatch = /^\[(Codex|Claude)\]\s+/i.exec(detail.label);

  if (labelMatch) {
    return labelMatch[1].toLowerCase() as SessionProvider;
  }

  return undefined;
}

function summarizeParallelToolDetails(details: ToolDetail[]) {
  return summarizeToolActivityBatch([
    {
      id: `parallel-tool-${details[0]?.id ?? "details"}`,
      type: "tool_group",
      summary: "",
      details
    }
  ]);
}

function mergeToolActivityBatch(batch: ToolGroupItem[]): ToolGroupItem {
  return {
    id: `${batch[0].id}-grouped-${batch.length}`,
    type: "tool_group",
    summary: summarizeToolActivityBatch(batch),
    details: batch
      .flatMap((tool) =>
        tool.details.map((detail) => ({
        ...detail,
        id: `${tool.id}-${detail.id}`
        }))
      )
      .filter(isInformativeToolDetail),
    provider: toolActivityBatchProvider(batch),
    defaultOpen: batch.some((tool) => tool.defaultOpen),
    status: batch.some((tool) => tool.status === "running")
      ? "running"
      : batch.some((tool) => tool.status === "failed")
        ? "failed"
        : batch.every((tool) => tool.status === "completed")
          ? "completed"
          : undefined
  };
}

function toolActivityBatchProvider(batch: ToolGroupItem[]): SessionProvider | undefined {
  const providers = batch
    .map((tool) => tool.provider)
    .filter((provider): provider is SessionProvider => Boolean(provider));
  const uniqueProviders = new Set(providers);

  if (uniqueProviders.size === 1) {
    return providers[0];
  }

  return uniqueProviders.size > 1 ? "meta" : undefined;
}

function summarizeToolActivityBatch(batch: ToolGroupItem[]) {
  const details = batch.flatMap((tool) => tool.details);
  const callDetails = details.filter((detail) => detail.kind === "call");
  const readCount = callDetails.filter((detail) => detail.action === "read").length;
  const editCount = callDetails.filter((detail) => detail.action === "edit").length;
  const searchCount = callDetails.filter(
    (detail) => detail.action === "search"
  ).length;
  const commandCount = callDetails.filter(
    (detail) => detail.action === "command"
  ).length;
  const generatedCount = callDetails.filter(
    (detail) => detail.action === "generate"
  ).length;
  const otherToolCount = callDetails.filter(
    (detail) => detail.action === "other" || !detail.action
  ).length;
  const exploredParts = [
    bareCount(readCount, "file"),
    bareCount(searchCount, "search", "searches")
  ].filter(Boolean);

  const parts = [
    pluralize(editCount, "edited", "file"),
    exploredParts.length > 0 ? `explored ${exploredParts.join(", ")}` : "",
    pluralize(commandCount, "ran", "command"),
    pluralize(otherToolCount, "used", "tool"),
    pluralize(generatedCount, "generated", "image")
  ].filter(Boolean);

  if (parts.length === 0) {
    return `${batch.length} tool calls`;
  }

  return capitalizeFirst(parts.join(", "));
}

function bareCount(count: number, noun: string, plural = `${noun}s`) {
  if (count === 0) {
    return "";
  }

  return `${count} ${count === 1 ? noun : plural}`;
}

function isInformativeToolDetail(detail: ToolDetail) {
  if (detail.kind === "output") {
    return Boolean(visibleToolOutput(detail)) && detail.label !== "Output returned";
  }

  if (detail.kind === "call") {
    return true;
  }

  return !/^Tool (output|result) returned$/i.test(detail.label);
}

function pluralize(count: number, verb: string, noun: string) {
  if (count === 0) {
    return "";
  }

  const nounText = `${noun}${count === 1 ? "" : "s"}`;
  return verb ? `${verb} ${count} ${nounText}` : `${count} ${nounText}`;
}

function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function ConversationTimeline({
  items,
  cwd,
  activeToolLabels = [],
  activeToolId,
  hasPendingWork = false,
  parallelAdoption,
  onOpenFile,
  onReviewChanges
}: {
  items: ConversationItem[];
  cwd?: string;
  activeToolLabels?: string[];
  activeToolId?: string;
  hasPendingWork?: boolean;
  parallelAdoption?: ParallelAdoptionControls;
  onOpenFile?: (filePath: string) => void;
  onReviewChanges?: (request?: ReviewChangeRequest) => void;
}) {
  return (
    <div data-conversation-content className="mx-auto w-full max-w-[820px]">
      <div data-conversation-stream className="grid gap-5 pt-3">
        {items.map((item) => (
          <ConversationItemView
            key={item.id}
            item={item}
            cwd={cwd}
            activeToolLabels={activeToolLabels}
            activeToolId={activeToolId}
            hasPendingWork={hasPendingWork}
            parallelAdoption={parallelAdoption}
            onOpenFile={onOpenFile}
            onReviewChanges={onReviewChanges}
          />
        ))}
      </div>
    </div>
  );
}

const ConversationItemView = memo(function ConversationItemView({
  item,
  cwd,
  activeToolLabels = [],
  activeToolId,
  hasPendingWork = false,
  parallelAdoption,
  onOpenFile,
  onReviewChanges
}: {
  item: ConversationItem;
  cwd?: string;
  activeToolLabels?: string[];
  activeToolId?: string;
  hasPendingWork?: boolean;
  parallelAdoption?: ParallelAdoptionControls;
  onOpenFile?: (filePath: string) => void;
  onReviewChanges?: (request?: ReviewChangeRequest) => void;
}) {
  if (item.type === "assistant_message") {
    return (
      <AssistantMessageBlock
        item={item}
        onOpenFile={onOpenFile}
        onReviewChanges={onReviewChanges}
      />
    );
  }

  if (item.type === "user_message") {
    return (
      <UserMessageBubble
        body={item.body}
        timestamp={item.timestamp}
        steered={item.steered}
        onOpenFile={onOpenFile}
      />
    );
  }

  if (item.type === "turn_status") {
    return <TurnStatusDivider label={item.label} />;
  }

  if (item.type === "tool_group") {
    if (isHandoffToolGroup(item)) {
      return <HandoffTimelineMarker item={item} />;
    }

    return (
      <ToolActivityGroup
        item={item}
        cwd={cwd}
        activeToolLabels={activeToolLabels}
        activeToolId={activeToolId}
        onOpenFile={onOpenFile}
        onReviewChanges={onReviewChanges}
      />
    );
  }

  if (item.type === "parallel_thread_group") {
    return (
      <ParallelThreadGroup
        item={item}
        cwd={cwd}
        activeToolLabels={activeToolLabels}
        activeToolId={activeToolId}
        hasPendingWork={hasPendingWork}
        parallelAdoption={parallelAdoption}
        onOpenFile={onOpenFile}
        onReviewChanges={onReviewChanges}
      />
    );
  }

  if (item.type === "running_tool") {
    return <RunningToolCard label={item.label} overlay={false} />;
  }

  if (item.type === "attachment_group") {
    return <AttachmentGroup item={item} />;
  }

  if (item.type === "file_change_summary") {
    return <FileChangeSummaryCard item={item} onReviewChanges={onReviewChanges} />;
  }

  if (item.type === "hook_event") {
    return <HookEventRow label={item.label} />;
  }

  if (item.type === "jump_marker") {
    return <JumpToLatestButton label={item.label} />;
  }

  return <NoticeRow label={item.label} />;
});

// The handoff marker names the provider being handed off TO (e.g. the loaded
// marker summary reads "Preparing handoff context for Codex"). Recover it from
// the tool group's summary / detail labels so the marker can read
// "Handed off to Codex".
function handoffTargetProvider(
  item: ToolGroupItem
): DelegateSessionProvider | undefined {
  const haystack = [
    item.summary,
    ...item.details.flatMap((detail) => {
      const provider = (detail.args as { provider?: unknown } | undefined)
        ?.provider;
      return [detail.label, typeof provider === "string" ? provider : ""];
    })
  ]
    .join(" ")
    .toLowerCase();

  if (haystack.includes("claude")) {
    return "claude";
  }
  if (haystack.includes("codex")) {
    return "codex";
  }
  return undefined;
}

// Dev-only popup contents: the handoff context/summary that was passed to the
// next agent.
function HandoffDebugPopup({ summary }: { summary: SessionHandoffSummary }) {
  return (
    <div className="block max-w-sm space-y-2 py-0.5 text-left">
      <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-wide text-app-dim">
        <span className="rounded bg-app-text/[0.08] px-1.5 py-0.5 text-[10px] text-app-text">
          dev
        </span>
        Handoff context → {providerLabel(summary.provider)} · ctx v
        {summary.contextVersion}
      </div>
      <p className="whitespace-pre-wrap text-[12px] leading-5 text-app-text">
        {summary.summary}
      </p>
      <HandoffDebugList label="Files changed" items={summary.filesChanged} />
      <HandoffDebugList label="Commands run" items={summary.commandsRun} />
      <HandoffDebugList label="Tests run" items={summary.testsRun} />
    </div>
  );
}

function HandoffDebugList({
  label,
  items
}: {
  label: string;
  items: string[];
}) {
  if (!items.length) {
    return null;
  }
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-app-dim">
        {label}
      </div>
      <ul className="mt-0.5 space-y-0.5">
        {items.slice(0, 8).map((entry, index) => (
          <li
            key={`${entry}-${index}`}
            className="truncate font-mono text-[11px] text-app-muted"
          >
            {entry}
          </li>
        ))}
        {items.length > 8 && (
          <li className="text-[11px] text-app-dim">+{items.length - 8} more</li>
        )}
      </ul>
    </div>
  );
}

function HandoffTimelineMarker({ item }: { item: ToolGroupItem }) {
  const running = item.status === "running";
  const failed = item.status === "failed";
  const target = handoffTargetProvider(item);
  const debugSummary = useContext(HandoffSummaryContext).get(item.id);
  // Surface the passed handoff context on hover, but only in development.
  const showDebug = import.meta.env.DEV && !running && Boolean(debugSummary);

  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-app-line bg-app-text/[0.04] px-2.5 py-1 text-[12px] font-medium text-app-muted",
        showDebug && "cursor-help border-dashed"
      )}
    >
      {failed ? (
        <>
          <History size={12} className={dimIcon} />
          Handoff skipped
        </>
      ) : target ? (
        <>
          <ArrowRight size={12} className={dimIcon} />
          Handed off to
          <ProviderLogo
            provider={target}
            className={cn(
              "h-3.5 w-3.5",
              target === "claude" && appSuccessText,
              target === "codex" && appAccentText
            )}
          />
          <span className="text-app-text">{providerLabel(target)}</span>
        </>
      ) : (
        <>
          <History size={12} className={dimIcon} />
          Handoff point
        </>
      )}
    </span>
  );

  return (
    <div className="my-1 flex max-w-[820px] items-center gap-3 text-[13px] text-app-dim">
      <div className="h-px flex-1 bg-app-line" />
      {running ? (
        <Shimmer as="span" className="font-medium" duration={1.6} spread={3}>
          {target ? `Handing off to ${providerLabel(target)}` : "Handing off"}
        </Shimmer>
      ) : showDebug && debugSummary ? (
        <Tooltip>
          <TooltipTrigger render={badge} />
          <TooltipContent side="top" className="max-w-sm">
            <HandoffDebugPopup summary={debugSummary} />
          </TooltipContent>
        </Tooltip>
      ) : (
        badge
      )}
      <div className="h-px flex-1 bg-app-line" />
    </div>
  );
}

const ParallelThreadGroup = memo(function ParallelThreadGroup({
  item,
  cwd,
  activeToolLabels = [],
  activeToolId,
  hasPendingWork = false,
  parallelAdoption,
  onOpenFile,
  onReviewChanges
}: {
  item: ParallelThreadGroupItem;
  cwd?: string;
  activeToolLabels?: string[];
  activeToolId?: string;
  hasPendingWork?: boolean;
  parallelAdoption?: ParallelAdoptionControls;
  onOpenFile?: (filePath: string) => void;
  onReviewChanges?: (request?: ReviewChangeRequest) => void;
}) {
  const hasSelection = Boolean(parallelAdoption?.selectedProvider);
  const seenParallelCoachmark = useOnboardingStore(
    (state) => state.seenParallelCoachmark
  );
  const dismissParallelCoachmark = useOnboardingStore(
    (state) => state.dismissParallelCoachmark
  );
  // One-time pointer the first time a user sees two agents run the same task.
  const showCoachmark =
    Boolean(parallelAdoption?.required) && !seenParallelCoachmark;
  // Precompute grouped column items and the config label once per column instead
  // of re-scanning on every render (P2-19). `item` carries a stable identity
  // (P1-3), so this only recomputes when the group actually changes.
  const columns = useMemo(
    () =>
      item.columns.map((column) => ({
        column,
        columnItems: parallelColumnItems(column.items),
        config: parallelColumnConfig(column.provider, column.items)
      })),
    [item.columns]
  );

  return (
    <div className="grid gap-4">
      {showCoachmark && (
        <div className="mx-auto flex w-full max-w-[560px] items-center gap-2.5 rounded-xl border border-app-line bg-app-text/[0.04] px-3 py-2 text-[12.5px] text-app-muted">
          <ProviderLogo provider="meta" className="h-4 w-4 shrink-0" />
          <span className="min-w-0">
            Same task, two agents. Keep the one you prefer below — or hand off to
            combine them.
          </span>
          <button
            type="button"
            className={cn(
              "ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:text-app-text",
              appHoverSurfaceSubtle,
              focusRing
            )}
            onClick={dismissParallelCoachmark}
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] lg:gap-x-5">
        {columns.map(({ column, columnItems, config }) => {
          const showColumnThinking = hasPendingWork && columnItems.length === 0;

          return (
            <Fragment key={column.provider}>
            <section
              className={cn(
                "min-w-0 transition",
                hasSelection &&
                  parallelAdoption?.selectedProvider !== column.provider &&
                  "opacity-60"
              )}
              aria-label={column.title}
            >
              <div className="mb-3 flex min-h-7 min-w-0 items-center justify-between gap-3 text-[12px] font-medium text-app-muted">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <ProviderLogo
                      provider={column.provider}
                      className={cn(
                        "h-3.5 w-3.5",
                        column.provider === "claude" && appSuccessText,
                        column.provider === "codex" && appAccentText
                      )}
                    />
                    <span className="truncate text-app-text">
                      {providerLabel(column.provider)}
                    </span>
                  </div>
                  {config && (
                    <span className="truncate text-[11px] font-normal text-app-dim">
                      {config}
                    </span>
                  )}
                </div>
                {parallelAdoption?.selectedProvider === column.provider && (
                  <span className="inline-flex h-5 items-center rounded-full bg-app-text/[0.06] px-2 text-[11px] text-app-text">
                    Selected
                  </span>
                )}
              </div>
              <div className="grid min-w-0 gap-4">
                {columnItems.map((columnItem, index) => (
                  <ConversationItemView
                    key={`${columnItem.id}-${index}`}
                    item={columnItem}
                    cwd={cwd}
                    activeToolLabels={activeToolLabels}
                    activeToolId={activeToolId}
                    hasPendingWork={hasPendingWork}
                    parallelAdoption={parallelAdoption}
                    onOpenFile={onOpenFile}
                    onReviewChanges={onReviewChanges}
                  />
                ))}
                {showColumnThinking && <ThinkingIndicator contained />}
              </div>
              {parallelAdoption?.required && isDelegateProvider(column.provider) && (
                <div className="pt-4">
                  <ParallelContinueButton
                    provider={column.provider}
                    selected={parallelAdoption.selectedProvider === column.provider}
                    onAdopt={parallelAdoption.onAdopt}
                  />
                </div>
              )}
            </section>
            {item.columns.length === 2 && column.provider === item.columns[0]?.provider && (
              <div className="hidden w-px bg-app-line/80 lg:block" aria-hidden="true" />
            )}
          </Fragment>
          );
        })}
      </div>
    </div>
  );
});

function parallelColumnConfig(provider: SessionProvider, items: ConversationItem[]) {
  for (const item of items) {
    if (item.type !== "tool_group") {
      continue;
    }

    for (const detail of item.details) {
      if (detail.toolName !== "meta_supervisor") {
        continue;
      }

      const model = formatParallelModel(provider, detail.args?.model);
      const intelligence = detail.args?.intelligence;

      return [model, intelligence].filter(Boolean).join(" · ");
    }
  }

  return undefined;
}

function formatParallelModel(provider: SessionProvider, model?: string) {
  if (!model) {
    return undefined;
  }

  if (/^gpt-/i.test(model)) {
    return model.toUpperCase();
  }

  const claudeMatch = /^claude-(.+)$/i.exec(model);

  if (claudeMatch) {
    const parts = claudeMatch[1].split("-");
    const hasDottedVersion =
      parts.length >= 2 &&
      /^\d+$/.test(parts[parts.length - 2] ?? "") &&
      /^\d+$/.test(parts[parts.length - 1] ?? "");
    const modelParts = hasDottedVersion
      ? [
          ...parts.slice(0, -2),
          `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
        ]
      : parts;
    const label = modelParts
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

    return provider === "claude" ? label : `Claude ${label}`;
  }

  return model;
}

function ParallelContinueButton({
  provider,
  selected = false,
  onAdopt
}: {
  provider: DelegateSessionProvider;
  selected?: boolean;
  onAdopt: (provider: DelegateSessionProvider) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors",
        selected
          ? "border-app-line-bright bg-app-text/[0.08] text-app-text"
          : "border-app-line bg-app-panel/60 text-app-muted hover:bg-app-hover hover:text-app-text"
      )}
      disabled={selected}
      onClick={() => onAdopt(provider)}
    >
      <Check size={13} />
      {selected
        ? `Continuing with ${providerLabel(provider)}`
        : `Continue with ${providerLabel(provider)}`}
    </button>
  );
}

function isDelegateProvider(
  provider: SessionProvider | undefined
): provider is DelegateSessionProvider {
  return provider !== undefined && canDelegateProvider(provider);
}

function parallelColumnItems(items: ConversationItem[]) {
  return groupConsecutiveToolActivity(
    items
      .filter((item) => !isParallelDelegateWrapper(item))
      .map(stripParallelProviderPrefixes),
    { includeLayoutGroups: true }
  );
}

function stripParallelProviderPrefixes(item: ConversationItem): ConversationItem {
  if (item.type !== "tool_group") {
    return item;
  }

  return {
    ...item,
    summary: stripProviderPrefix(item.summary),
    details: item.details.map((detail) => ({
      ...detail,
      label: stripProviderPrefix(detail.label)
    }))
  };
}

function stripProviderPrefix(value: string) {
  return value.replace(/^\[(?:Codex|Claude)\]\s+/i, "");
}

function isParallelDelegateWrapper(item: ConversationItem) {
  if (item.type === "assistant_message") {
    return /^\s*\*\*(?:Codex|Claude) parallel delegate\*\*\s*$/i.test(item.body);
  }

  if (item.type === "tool_group") {
    return item.details.some((detail) => detail.toolName === "meta_supervisor") ||
      /(?:codex|claude) parallel delegate started/i.test(item.summary) ||
      isInitialUserEchoTool(item);
  }

  return false;
}

function isInitialUserEchoTool(item: ToolGroupItem) {
  const text = [
    item.summary,
    ...item.details.map((detail) => detail.label)
  ].join(" ");

  return /\buser message\b/i.test(text);
}

export function TurnStatusDivider({ label }: { label: string }) {
  return (
    <div className="grid max-w-[820px] gap-3">
      <div className="text-[15px] text-app-muted">{label}</div>
      <div className="h-px bg-app-line" />
    </div>
  );
}

export const UserMessageBubble = memo(function UserMessageBubble({
  body,
  timestamp,
  steered,
  onOpenFile
}: {
  body: string;
  timestamp?: string;
  steered?: boolean;
  onOpenFile?: (filePath: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyMessage = () => {
    void navigator.clipboard?.writeText(body).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="grid justify-items-end gap-1.5">
      {steered && (
        <div className="inline-flex items-center gap-1.5 text-[11px] text-app-dim">
          <History size={12} />
          <span>Steered conversation</span>
        </div>
      )}
      <div className={cn("max-w-[620px] px-4 py-3 text-app-text", cardSurface)}>
        <ChatMessageMarkdown tone="user" onOpenFile={onOpenFile}>
          {body}
        </ChatMessageMarkdown>
      </div>
      <div className="flex items-center gap-2.5 pr-1 text-[11px] text-app-dim">
        {timestamp && <span>{timestamp}</span>}
        <TooltipButton
          className={subtleIconButton}
          aria-label={copied ? "Copied user message" : "Copy user message"}
          tooltip={copied ? "Copied" : "Copy message"}
          onClick={copyMessage}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </TooltipButton>
      </div>
    </div>
  );
});

export const AssistantMessageBlock = memo(function AssistantMessageBlock({
  item,
  onOpenFile,
  onReviewChanges
}: {
  item: Extract<ConversationItem, { type: "assistant_message" }>;
  onOpenFile?: (filePath: string) => void;
  onReviewChanges?: (request?: ReviewChangeRequest) => void;
}) {
  return (
    <div className="grid max-w-[820px] gap-3">
      <ChatMessageMarkdown tone="assistant" onOpenFile={onOpenFile}>
        {item.body}
      </ChatMessageMarkdown>
      {item.attachments?.map((attachment) => (
        <FileChangeSummaryCard
          key={attachment.id}
          item={attachment}
          onReviewChanges={onReviewChanges}
        />
      ))}
    </div>
  );
});

export function AttachmentGroup({
  item
}: {
  item: Extract<ConversationItem, { type: "attachment_group" }>;
}) {
  const [previewAttachment, setPreviewAttachment] =
    useState<ConversationAttachment | null>(null);
  const imageAttachments = item.attachments.filter(
    (attachment) => getMediaCategory(attachment) === "image" && attachment.url
  );
  const fileAttachments = item.attachments.filter(
    (attachment) => !imageAttachments.includes(attachment)
  );

  return (
    <div className="grid justify-items-end gap-1.5">
      {imageAttachments.length > 0 && (
        <Attachments
          variant="grid"
          className="max-w-[620px] justify-end gap-2"
          aria-label="User image attachments"
        >
          {imageAttachments.map((attachment) => (
            <Attachment
              data={attachment}
              key={attachment.id}
              role="button"
              tabIndex={0}
              title={getAttachmentLabel(attachment)}
              onClick={() => setPreviewAttachment(attachment)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setPreviewAttachment(attachment);
                }
              }}
              className={cn(
                "size-[64px] cursor-zoom-in p-0.5",
                subtleCardSurface,
                "ring-1 ring-app-text/[0.03] transition hover:border-app-line-bright hover:bg-app-panel-2"
              )}
            >
              <AttachmentPreview className={cn("rounded-md", appSoftSurface)} />
            </Attachment>
          ))}
        </Attachments>
      )}
      {fileAttachments.length > 0 && (
        <Attachments
          variant="inline"
          className="max-w-[620px] justify-end gap-2"
          aria-label="User file attachments"
        >
          {fileAttachments.map((attachment) => (
            <Attachment
              data={attachment}
              key={attachment.id}
              title={attachment.title ?? attachment.filename}
              className={cn(
                "h-8 max-w-[220px] rounded-full border-app-line-strong bg-app-text/[0.07] px-2",
                "text-app-text shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-app-text)_4%,transparent)]",
                "hover:bg-app-text/[0.09]"
              )}
            >
              <AttachmentPreview className="bg-app-text/[0.06] text-app-muted [&_svg]:text-app-muted" />
              <AttachmentInfo className="text-[12px]" />
            </Attachment>
          ))}
        </Attachments>
      )}
      {item.timestamp && (
        <div className="pr-1 text-xs text-app-dim">{item.timestamp}</div>
      )}
      <AttachmentPreviewDialog
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    </div>
  );
}

function AttachmentPreviewDialog({
  attachment,
  onClose
}: {
  attachment: ConversationAttachment | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!attachment) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [attachment, onClose]);

  if (!attachment || getMediaCategory(attachment) !== "image" || !attachment.url) {
    return null;
  }

  return (
    <div
      className={cn("fixed inset-0 z-50 grid place-items-center p-8 backdrop-blur-md", appOverlaySurface)}
      role="dialog"
      aria-modal="true"
      aria-label={getAttachmentLabel(attachment)}
      onClick={onClose}
    >
      <div
        className="grid max-h-full max-w-[min(1200px,94vw)] gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <img
          alt={getAttachmentLabel(attachment)}
          className="max-h-[82vh] max-w-full rounded-2xl object-contain shadow-[0_28px_90px_color-mix(in_srgb,var(--color-app-bg)_55%,transparent)]"
          src={attachment.url}
        />
        <div className="mx-auto max-w-[80vw] truncate rounded-full bg-app-bg/45 px-3 py-1 text-center text-xs text-app-muted">
          {getAttachmentLabel(attachment)}
        </div>
      </div>
    </div>
  );
}

function ChatMessageMarkdown({
  children,
  tone,
  onOpenFile
}: {
  children: string;
  tone: "assistant" | "user";
  onOpenFile?: (filePath: string) => void;
}) {
  return (
    <MessageResponse
      className={cn(
        "composer-message-markdown min-w-0 text-[13.5px] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_a]:text-[#b7c3ff] [&_a]:underline-offset-4 hover:[&_a]:text-[#cbd4ff] hover:[&_a]:underline",
        "[&_blockquote]:my-2.5 [&_blockquote]:border-l-2 [&_blockquote]:border-app-line-strong [&_blockquote]:pl-3 [&_blockquote]:text-app-muted",
        "[&_code]:rounded [&_code]:bg-app-text/[0.07] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]",
        "[&_h1]:mb-2.5 [&_h1]:mt-4 [&_h1]:text-[18px] [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-3.5 [&_h3]:text-[14px] [&_h3]:font-semibold",
        "[&_li]:my-0.5 [&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-0 [&_p+p]:mt-3 [&_pre]:my-2.5 [&_pre]:max-w-full [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-app-line [&_pre]:bg-app-bg/25 [&_pre]:p-2.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_table]:my-2.5 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-app-line [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-app-line [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
        "[&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5",
        tone === "assistant"
          ? "leading-[1.54] text-app-text/95"
          : "leading-[1.4] text-app-text"
      )}
      controls={{
        code: { copy: false, download: false },
        table: { copy: false, download: false, fullscreen: false }
      }}
      components={{
        a: (props) => (
          <MarkdownLink {...props} onOpenFile={onOpenFile} />
        ),
        code: MarkdownCode
      }}
      parseIncompleteMarkdown={false}
    >
      {tone === "user" ? escapeHtmlLikeTags(children) : children}
    </MessageResponse>
  );
}

function escapeHtmlLikeTags(value: string) {
  return value.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function MarkdownLink({
  children,
  href,
  onOpenFile,
  node: _node,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  onOpenFile?: (filePath: string) => void;
  node?: unknown;
}) {
  const filePath = normalizeLocalFileHref(href);

  if (filePath && onOpenFile) {
    return (
      <TooltipButton
        className={cn("inline text-left underline-offset-4 hover:underline", markdownLinkText)}
        tooltip="Open file"
        type="button"
        onClick={() => onOpenFile(filePath)}
      >
        {children}
      </TooltipButton>
    );
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    props.onClick?.(event);

    if (event.defaultPrevented || !href || !isHttpHref(href)) {
      return;
    }

    event.preventDefault();
    void openExternalHttpLink(href);
  }

  return (
    <a
      {...props}
      href={href}
      onClick={handleClick}
      rel="noreferrer"
      target={href?.startsWith("#") ? undefined : "_blank"}
    >
      {children}
    </a>
  );
}

function isHttpHref(href?: string) {
  if (!href) {
    return false;
  }

  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function openExternalHttpLink(href: string) {
  try {
    if (window.composer?.openExternalUrl) {
      await window.composer.openExternalUrl(href);
      return;
    }
  } catch (error) {
    console.warn("Failed to open link externally", error);
  }

  window.open(href, "_blank", "noopener,noreferrer");
}

function normalizeLocalFileHref(href?: string) {
  if (!href) {
    return null;
  }

  let value = href.trim();

  if (value.startsWith("file://")) {
    try {
      value = decodeURIComponent(new URL(value).pathname);
    } catch {
      value = value.replace(/^file:\/\//, "");
    }
  } else {
    try {
      value = decodeURIComponent(value);
    } catch {
      // Keep the original href when it is not URI encoded.
    }
  }

  if (!value.startsWith("/")) {
    return null;
  }

  return value.replace(/:\d+(?::\d+)?$/, "");
}

function resolveToolDetailFilePath(detail: ToolDetail, cwd?: string) {
  const candidate =
    detail.path ??
    detail.args?.file_path ??
    detail.args?.path ??
    pathFromLabel(formatToolDetailLabel(detail));

  if (!candidate || !looksLikeFilePath(candidate)) {
    return null;
  }

  if (candidate.startsWith("/")) {
    return candidate;
  }

  if (!cwd) {
    return null;
  }

  return resolvePosixPath(cwd, candidate);
}

function pathFromLabel(label: string) {
  const cleaned = label
    .replace(/^Read\s+/i, "")
    .replace(/^Edited\s+/i, "")
    .replace(/^Created\s+/i, "")
    .trim();

  return cleaned.includes(" ") ? null : cleaned;
}

function looksLikeFilePath(value: string) {
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    (value.includes("/") && /\.[a-z0-9]+$/i.test(value))
  );
}

function resolvePosixPath(basePath: string, relativePath: string) {
  const parts = `${basePath.replace(/\/+$/, "")}/${relativePath}`
    .split("/")
    .filter(Boolean);
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === ".") {
      continue;
    }

    if (part === "..") {
      resolved.pop();
      continue;
    }

    resolved.push(part);
  }

  return `/${resolved.join("/")}`;
}

function MarkdownCode({
  children,
  className,
  ...props
}: {
  children?: ReactNode;
  className?: string;
  node?: unknown;
  "data-block"?: boolean | string;
}) {
  const isBlock = "data-block" in props;

  if (!isBlock) {
    return (
      <code className={className} data-streamdown="inline-code">
        {children}
      </code>
    );
  }

  return (
    <code className={className} data-streamdown="block-code">
      {children}
    </code>
  );
}

export const ToolActivityGroup = memo(function ToolActivityGroup({
  item,
  cwd,
  activeToolLabels = [],
  activeToolId,
  onOpenFile,
  onReviewChanges
}: {
  item: Extract<ConversationItem, { type: "tool_group" }>;
  cwd?: string;
  activeToolLabels?: string[];
  activeToolId?: string;
  onOpenFile?: (filePath: string) => void;
  onReviewChanges?: (request?: ReviewChangeRequest) => void;
}) {
  const [open, toggleOpen] = usePersistentDisclosure(
    item.id,
    item.defaultOpen ?? true
  );
  const active =
    item.status === "running" ||
    item.id === activeToolId ||
    matchesActiveToolLabel(item, activeToolLabels);
  const renderItems = toolDetailRenderItems(
    item.details.filter(isRenderableToolDetail)
  );
  const defaultExpandedCommandIndex = renderItems.findIndex(
    (renderItem) => isCommandToolDetail(renderItem.detail)
  );

  return (
    <div className="grid max-w-[820px] gap-2.5 py-0.5" data-tool-activity-group>
      <TooltipButton
        className={cn(
          "grid w-fit max-w-full items-center gap-2.5 text-left text-[15px] leading-6 text-app-dim transition-colors hover:text-app-muted",
          item.provider
            ? "grid-cols-[16px_18px_minmax(0,1fr)_18px]"
            : "grid-cols-[18px_minmax(0,1fr)_18px]"
        )}
        onClick={toggleOpen}
        aria-expanded={open}
        tooltip={open ? "Collapse tool activity" : "Expand tool activity"}
      >
        {item.provider && (
          <ProviderLogo provider={item.provider} className="h-3.5 w-3.5 text-app-muted" />
        )}
        <ToolGroupIcon item={item} />
        {active ? (
          <Shimmer as="span" className="truncate font-medium" duration={1.5} spread={3}>
            {item.summary}
          </Shimmer>
        ) : (
          <span className={cn("truncate", active && "font-medium text-app-muted")}>
            {item.summary}
          </span>
        )}
        <ChevronDown
          size={16}
          className={cn(
            "text-app-dim transition-transform",
            !open && "-rotate-90"
          )}
        />
      </TooltipButton>

      {open && (
        <div className="grid gap-1.5 text-[15px] leading-7 text-app-dim">
          {renderItems.map((renderItem, index) => (
            <ToolDetailRow
              key={renderItem.id}
              detail={renderItem.detail}
              outputDetail={renderItem.outputDetail}
              cwd={cwd}
              onOpenFile={onOpenFile}
              onReviewChanges={onReviewChanges}
              defaultOpen={
                Boolean(item.defaultOpen) &&
                index === defaultExpandedCommandIndex
              }
              active={active && isActiveToolRenderItem(renderItem, index, renderItems)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

type ToolDetailRenderItem = {
  id: string;
  detail: ToolDetail;
  outputDetail?: ToolDetail;
};

function toolDetailRenderItems(details: ToolDetail[]): ToolDetailRenderItem[] {
  const items: ToolDetailRenderItem[] = [];

  for (const detail of details) {
    if (detail.kind === "output") {
      const ownerItem = findLastOutputOwnerRenderItem(items);

      if (ownerItem && !ownerItem.outputDetail) {
        ownerItem.id = `${ownerItem.detail.id}-${detail.id}`;
        ownerItem.outputDetail = detail;
      }

      continue;
    }

    items.push({ id: detail.id, detail });
  }

  return items;
}

function findLastOutputOwnerRenderItem(items: ToolDetailRenderItem[]) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];

    if (canOwnToolOutput(item.detail)) {
      return item;
    }
  }

  return undefined;
}

function isActiveToolRenderItem(
  item: ToolDetailRenderItem,
  index: number,
  items: ToolDetailRenderItem[]
) {
  return (
    item.detail.status === "running" ||
    item.outputDetail?.status === "running" ||
    index === items.length - 1
  );
}

function isCommandToolDetail(detail: ToolDetail) {
  return detail.tone === "command" || detail.action === "command";
}

function canOwnToolOutput(detail: ToolDetail) {
  return (
    isCommandToolDetail(detail) ||
    detail.action === "search" ||
    detail.action === "generate" ||
    detail.action === "other" ||
    (detail.kind === "call" &&
      detail.action !== "read" &&
      Boolean(detail.args && Object.keys(detail.args).length > 0))
  );
}

function ToolGroupIcon({ item }: { item: ToolGroupItem }) {
  const Icon = item.details.some((detail) => detail.action === "edit")
    ? Pencil
    : TerminalSquare;

  return <Icon size={16} className={dimIcon} />;
}

function isRenderableToolDetail(detail: ToolDetail) {
  if (detail.kind !== "output") {
    return isInformativeToolDetail(detail);
  }

  return Boolean(visibleToolOutput(detail));
}

function matchesActiveToolLabel(item: ToolGroupItem, labels: string[]) {
  if (labels.length === 0) {
    return false;
  }

  const groupText = normalizeToolMatchText([
    item.summary,
    ...item.details.flatMap((detail) => [
      detail.label,
      detail.toolName,
      detail.command,
      detail.path,
      visibleToolOutput(detail)
    ])
  ]);

  if (!groupText) {
    return false;
  }

  return labels.some((label) => {
    const activeText = normalizeToolMatchText([label]);

    return (
      activeText.length > 0 &&
      (groupText.includes(activeText) || activeText.includes(groupText))
    );
  });
}

function normalizeToolMatchText(values: Array<string | undefined>) {
  return values
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function ToolDetailRow({
  detail,
  outputDetail,
  cwd,
  onOpenFile,
  onReviewChanges,
  defaultOpen = false,
  active = false
}: {
  detail: ToolDetail;
  outputDetail?: ToolDetail;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
  onReviewChanges?: (request?: ReviewChangeRequest) => void;
  defaultOpen?: boolean;
  active?: boolean;
}) {
  const reviewFiles = detail.reviewFiles ?? [];
  const expandable =
    reviewFiles.length > 0 ||
    isCommandToolDetail(detail) ||
    detail.tone === "output" ||
    (detail.kind === "call" &&
      detail.action !== "read" &&
      Boolean(detail.args && Object.keys(detail.args).length > 0));
  const [open, toggleOpen] = usePersistentDisclosure(detail.id, defaultOpen);
  const rowLabel = formatToolDetailLabel(detail);
  const filePath = resolveToolDetailFilePath(detail, cwd);
  const tooltip = rowLabel || detail.label;

  if (reviewFiles.length > 0) {
    return (
      <ToolReviewDetail
        detail={detail}
        files={reviewFiles}
        cwd={cwd}
        defaultOpen={defaultOpen}
        active={active}
        onReviewChanges={onReviewChanges}
      />
    );
  }

  if (expandable) {
    return (
      <div className="grid gap-2">
        <TooltipButton
          className="grid min-w-0 grid-cols-[minmax(0,1fr)_18px] items-center gap-2 text-left text-app-muted transition-colors hover:text-app-text"
          onClick={toggleOpen}
          aria-expanded={open}
          tooltip={tooltip}
        >
          {active ? (
            <Shimmer
              as="span"
              className="truncate"
              duration={1.35}
              spread={3}
            >
              {rowLabel}
            </Shimmer>
          ) : (
            <span
              className={cn(
                "truncate",
                detail.tone === "output" && "text-app-dim",
                detail.action === "edit" && "text-app-muted"
              )}
            >
              {rowLabel}
            </span>
          )}
          <ChevronDown
            className={cn("text-app-dim transition-transform", !open && "-rotate-90")}
            size={15}
          />
        </TooltipButton>
        {open && <ToolPayloadCard detail={detail} outputDetail={outputDetail} />}
      </div>
    );
  }

  return (
    <TooltipButton
      className={cn(
        "min-w-0 truncate text-left",
        filePath && onOpenFile && `transition-colors ${appAccentHoverText}`,
        detail.tone === "error" && appDangerSoftText,
        detail.tone === "summary" && "text-app-dim"
      )}
      type="button"
      disabled={!filePath || !onOpenFile}
      onClick={() => filePath && onOpenFile?.(filePath)}
      tooltip={tooltip}
    >
      {active ? (
        <Shimmer as="span" className="truncate" duration={1.35} spread={3}>
          {rowLabel}
        </Shimmer>
      ) : (
        rowLabel
      )}
    </TooltipButton>
  );
}

function ToolReviewDetail({
  detail,
  files,
  cwd,
  defaultOpen,
  active = false,
  onReviewChanges
}: {
  detail: ToolDetail;
  files: ReviewDiffFile[];
  cwd?: string;
  defaultOpen: boolean;
  active?: boolean;
  onReviewChanges?: (request?: ReviewChangeRequest) => void;
}) {
  const [open, toggleOpen] = usePersistentDisclosure(detail.id, defaultOpen);
  const summary = reviewFilesSummary(files);
  const openReview = () => {
    onReviewChanges?.({ files });
  };

  return (
    <div className="grid gap-2">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_30px_18px] items-center gap-2">
        <TooltipButton
          className="min-w-0 truncate text-left text-app-muted transition-colors hover:text-app-text"
          type="button"
          tooltip={open ? "Collapse edit diff" : "Expand edit diff"}
          onClick={toggleOpen}
        >
          {active ? (
            <Shimmer as="span" className="truncate" duration={1.35} spread={3}>
              {summary.label}
            </Shimmer>
          ) : (
            <span className="truncate">
              {summary.label}{" "}
              <span className={appSuccessText}>+{summary.additions}</span>{" "}
              <span className={appDangerText}>-{summary.deletions}</span>
            </span>
          )}
        </TooltipButton>
        <TooltipButton
          className={subtleIconButton}
          aria-label="Open diff review"
          tooltip="Open diff review"
          onClick={openReview}
          type="button"
        >
          <Maximize2 size={14} />
        </TooltipButton>
        <TooltipButton
          className={subtleIconButton}
          aria-label={open ? "Collapse edit diff" : "Expand edit diff"}
          aria-expanded={open}
          tooltip={open ? "Collapse edit diff" : "Expand edit diff"}
          onClick={toggleOpen}
        >
          <ChevronDown
            className={cn("text-app-dim transition-transform", !open && "-rotate-90")}
            size={15}
          />
        </TooltipButton>
      </div>
      {open && (
        <div className="grid gap-2">
          {files.map((file) => (
            <ToolReviewFileCard
              key={file.path}
              file={file}
              cwd={cwd}
              allFiles={files}
              onReviewChanges={onReviewChanges}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function reviewFilesSummary(files: ReviewDiffFile[]) {
  const additions = files.reduce((total, file) => total + file.additions, 0);
  const deletions = files.reduce((total, file) => total + file.deletions, 0);
  const label =
    files.length === 1
      ? `Edited ${displayPath(files[0].path)}`
      : `Edited ${files.length} files`;

  return { label, additions, deletions };
}

function ToolReviewFileCard({
  file,
  cwd,
  allFiles,
  onReviewChanges
}: {
  file: ReviewDiffFile;
  cwd?: string;
  allFiles: ReviewDiffFile[];
  onReviewChanges?: (request?: ReviewChangeRequest) => void;
}) {
  return (
    <div className={cn("overflow-hidden", cardSurface)}>
      <div className="grid min-h-[34px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-app-line px-3 text-[13px]">
        <TooltipButton
          className={cn("min-w-0 truncate text-left", appAccentHoverText)}
          tooltip={`Open ${file.path} in review`}
          onClick={() =>
            onReviewChanges?.({
              filePath: file.path,
              files: allFiles
            })
          }
        >
          <span className="truncate">{file.path}</span>
        </TooltipButton>
        <span className="whitespace-nowrap">
          <span className={appSuccessText}>+{file.additions}</span>{" "}
          <span className={appDangerText}>-{file.deletions}</span>
        </span>
      </div>
      {cwd && file.hunks.length > 0 && (
        <div className="thin-scrollbar max-h-[260px] overflow-auto text-[12px] leading-5">
          <DiffView cwd={cwd} file={file} />
        </div>
      )}
    </div>
  );
}

function displayPath(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? filePath;
}

function ToolPayloadCard({
  detail,
  outputDetail
}: {
  detail: ToolDetail;
  outputDetail?: ToolDetail;
}) {
  const [copied, setCopied] = useState(false);
  const isCommand = isCommandToolDetail(detail);
  const isOutput = detail.kind === "output";
  const command = detail.command ?? commandPayload(detail.label);
  const output = outputDetail ? visibleToolOutput(outputDetail) : "";
  const inputPayload = isCommand
    ? command
    : isOutput
      ? visibleToolOutput(detail)
      : formatToolArgs(detail.args);
  const payload = isCommand
    ? [command ? `$ ${command}` : "", output].filter(Boolean).join("\n\n")
    : isOutput
      ? visibleToolOutput(detail)
      : [inputPayload, output].filter(Boolean).join("\n\n");
  const copyPayload = () => {
    void navigator.clipboard?.writeText(payload).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };
  const status = outputDetail?.status ?? detail.status;

  return (
    <div className={cn("overflow-hidden px-4 py-3 text-app-muted", cardSurface)}>
      <div className="mb-3 text-[15px] leading-6 text-app-dim">
        {isCommand ? "Shell" : isOutput ? "Output" : "Details"}
      </div>
      {isCommand || isOutput || !output ? (
        <pre className="thin-scrollbar max-h-[260px] overflow-auto whitespace-pre-wrap break-words font-mono text-[15px] leading-7 text-app-text">
          {payload}
        </pre>
      ) : (
        <div className="grid gap-4">
          {inputPayload && (
            <pre className="thin-scrollbar max-h-[180px] overflow-auto whitespace-pre-wrap break-words font-mono text-[15px] leading-7 text-app-text">
              {inputPayload}
            </pre>
          )}
          <div className="border-t border-app-line pt-3">
            <div className="mb-3 text-[15px] leading-6 text-app-dim">Output</div>
            <pre className="thin-scrollbar max-h-[260px] overflow-auto whitespace-pre-wrap break-words font-mono text-[15px] leading-7 text-app-text">
              {output}
            </pre>
          </div>
        </div>
      )}
      <div className="mt-4 flex items-center justify-end gap-4 text-[14px] text-app-dim">
        <TooltipButton
          className={subtleIconButton}
          aria-label={copied ? "Copied shell output" : "Copy shell output"}
          tooltip={copied ? "Copied" : "Copy"}
          onClick={copyPayload}
          type="button"
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </TooltipButton>
        <span>{status === "failed" ? "Failed" : "✓ Success"}</span>
      </div>
    </div>
  );
}

function formatToolDetailLabel(detail: ToolDetail) {
  if (detail.kind === "call") {
    return detail.label;
  }

  if (isCommandToolDetail(detail)) {
    return "Ran command";
  }

  if (detail.kind === "output") {
    return meaningfulOutputLabel(visibleToolOutput(detail)) || "Output returned";
  }

  return detail.label;
}

function visibleToolOutput(detail: ToolDetail) {
  if (detail.kind !== "output") {
    return "";
  }

  return decodeToolOutput(detail.output ?? detail.label).trim();
}

function meaningfulOutputLabel(output: string) {
  const firstLine = output.trim().split("\n").find(Boolean);
  return firstLine ? trimToolText(firstLine) : "";
}

function decodeToolOutput(output: string) {
  const cleaned = cleanToolOutputEnvelope(output);

  if (!cleaned) {
    return "";
  }

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    return extractVisibleJsonText(parsed);
  } catch {
    if (/^\s*[{[]/.test(cleaned)) {
      return extractPartialJsonOutput(cleaned);
    }

    return cleaned;
  }
}

function cleanToolOutputEnvelope(output: string) {
  return output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();

      if (!trimmed) {
        return true;
      }

      return !(
        /^Chunk ID:/i.test(trimmed) ||
        /^Wall time:/i.test(trimmed) ||
        /^Process exited with code/i.test(trimmed) ||
        /^Process running with session ID/i.test(trimmed) ||
        /^Original token count:/i.test(trimmed) ||
        /^Output:\s*$/i.test(trimmed)
      );
    })
    .join("\n")
    .trim();
}

function extractVisibleJsonText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(extractVisibleJsonText).filter(Boolean).join("\n\n");
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  const preferredKeys = [
    "output",
    "text",
    "message",
    "error",
    "content",
    "result",
    "stdout",
    "stderr"
  ];

  for (const key of preferredKeys) {
    const text = extractVisibleJsonText(record[key]);

    if (text) {
      return text;
    }
  }

  return "";
}

function extractPartialJsonOutput(value: string) {
  const match = value.match(/"output"\s*:\s*"((?:\\.|[^"\\])*)/s);

  if (!match) {
    return "";
  }

  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
}

function trimToolText(value: string) {
  return value.length > 240 ? `${value.slice(0, 237)}...` : value;
}

function commandPayload(value: string) {
  return value
    .replace(/^Ran\s+/i, "")
    .replace(/^(cmd|command):\s*/i, "")
    .trim();
}

function formatToolArgs(args?: Record<string, string>) {
  if (!args || Object.keys(args).length === 0) {
    return "No additional details";
  }

  return Object.entries(args)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

export function RunningToolCard({
  label,
  overlay = true
}: {
  label: string;
  overlay?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid max-w-[820px] grid-cols-[22px_minmax(0,1fr)_22px_22px] items-center gap-2.5 border border-app-line bg-app-panel/92 px-3.5 text-[14px] text-app-muted shadow-[0_12px_34px_color-mix(in_srgb,var(--color-app-bg)_24%,transparent)]",
        overlay
          ? "h-[58px] rounded-t-2xl border-b-0 pb-1.5"
          : "h-[50px] rounded-lg"
      )}
    >
      <TerminalSquare size={15} />
      <Shimmer as="span" className="truncate font-medium" duration={1.45} spread={3}>
        {label}
      </Shimmer>
      <TooltipButton
        className={subtleIconButton}
        aria-label="Stop running tool"
        tooltip="Stop running tool"
      >
        <Square size={10} fill="currentColor" />
      </TooltipButton>
      <TooltipButton
        className={subtleIconButton}
        aria-label="Expand running tool"
        tooltip="Expand running tool"
      >
        <ChevronDown className="-rotate-90" size={15} />
      </TooltipButton>
    </div>
  );
}

export const FileChangeSummaryCard = memo(function FileChangeSummaryCard({
  item,
  onReviewChanges
}: {
  item: Extract<ConversationItem, { type: "file_change_summary" }>;
  onReviewChanges?: (request?: ReviewChangeRequest) => void;
}) {
  const [open, toggleOpen] = usePersistentDisclosure(
    item.id,
    Boolean(item.defaultOpen)
  );

  return (
    <div className="max-w-[820px] overflow-hidden rounded-lg border border-app-line bg-app-panel/94 shadow-[0_14px_34px_color-mix(in_srgb,var(--color-app-bg)_24%,transparent)]">
      <div className="grid min-h-[46px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-app-line px-3.5">
        <div className="min-w-0 truncate text-[14px] text-app-text">
          {item.summary}{" "}
          <span className={appSuccessText}>+{item.additions}</span>{" "}
          <span className={appDangerText}>-{item.deletions}</span>
        </div>
        <div className="flex items-center gap-3 text-[13px] text-app-dim">
          <TooltipButton
            className="inline-flex items-center gap-1.5 hover:text-app-muted"
            tooltip="Undo changes"
          >
            <span>Undo</span>
          </TooltipButton>
          <TooltipButton
            className="inline-flex items-center gap-1.5 hover:text-app-muted"
            tooltip="Review changes"
            onClick={() =>
              onReviewChanges?.({
                files: item.files.map((file) => fileChangeRowToReviewFile(file))
              })
            }
          >
            <span>Review</span>
            <ExternalLink size={13} />
          </TooltipButton>
          <TooltipButton
            className={subtleIconButton}
            aria-label={open ? "Collapse file changes" : "Expand file changes"}
            aria-expanded={open}
            tooltip={open ? "Collapse file changes" : "Expand file changes"}
            onClick={toggleOpen}
          >
            <ChevronDown
              size={15}
              className={cn("transition-transform", !open && "-rotate-90")}
            />
          </TooltipButton>
          <TooltipButton
            className={subtleIconButton}
            aria-label="Expand review card"
            tooltip="Expand review card"
          >
            <Maximize2 size={13} />
          </TooltipButton>
        </div>
      </div>

      {open && (
        <div className="grid">
          {item.files.map((file) => (
            <FileChangeRowView
              key={file.path}
              file={file}
              onReviewChanges={onReviewChanges}
            />
          ))}
        </div>
      )}
    </div>
  );
});

function FileChangeRowView({
  file,
  onReviewChanges
}: {
  file: FileChangeRow;
  onReviewChanges?: (request?: ReviewChangeRequest) => void;
}) {
  return (
    <TooltipButton
      className="grid min-h-[38px] grid-cols-[minmax(0,1fr)_auto_22px] items-center gap-2.5 border-b border-app-line px-3.5 text-left text-[13px] last:border-b-0 hover:bg-app-text/[0.035]"
      tooltip={`View changes in ${file.path}`}
      onClick={() =>
        onReviewChanges?.({
          filePath: file.path,
          files: [fileChangeRowToReviewFile(file)]
        })
      }
    >
      <span className="min-w-0 truncate text-app-text">{file.path}</span>
      <span className="whitespace-nowrap">
        <span className={appSuccessText}>+{file.additions}</span>{" "}
        <span className={appDangerText}>-{file.deletions}</span>
      </span>
      <ChevronDown size={14} className={dimIcon} />
    </TooltipButton>
  );
}

function fileChangeRowToReviewFile(file: FileChangeRow): ReviewDiffFile {
  return {
    path: file.path,
    additions: file.additions,
    deletions: file.deletions,
    hunks: []
  };
}

export function HookEventRow({ label }: { label: string }) {
  return (
    <div className="inline-flex w-fit max-w-[820px] items-center gap-2 text-[13px] text-app-dim/70">
      <Anchor size={13} />
      <span>{label}</span>
    </div>
  );
}

function NoticeRow({ label }: { label: string }) {
  const isError = /\b(failed|error|stopped)\b/i.test(label);

  return (
    <div
      className={cn(
        "max-w-[820px] rounded-[12px] px-3 py-2 text-[13px]",
        isError
          ? "border border-destructive/20 bg-destructive/10 text-destructive"
          : "text-app-dim/70"
      )}
    >
      {label}
    </div>
  );
}

export function JumpToLatestButton({
  label,
  onClick
}: {
  label?: string;
  onClick?: () => void;
}) {
  return (
    <div className="grid justify-items-center">
      <TooltipButton
        className={cn(
          subtleIconButton,
          "border border-app-line bg-app-panel/80 text-app-text shadow-[0_10px_24px_color-mix(in_srgb,var(--color-app-bg)_22%,transparent)]"
        )}
        aria-label={label ?? "Jump to latest"}
        tooltip={label ?? "Jump to latest"}
        onClick={onClick}
      >
        <ArrowDown size={16} />
      </TooltipButton>
    </div>
  );
}

function JumpToLatestOverlay({
  hasPendingWork,
  onJump
}: {
  hasPendingWork: boolean;
  onJump: () => void;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-20 px-5",
        hasPendingWork ? "bottom-[228px]" : "bottom-[164px]"
      )}
    >
      <div className="pointer-events-auto mx-auto w-full max-w-[820px]">
        <JumpToLatestButton label="Jump to latest" onClick={onJump} />
      </div>
    </div>
  );
}
