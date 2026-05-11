import {
  useEffect,
  useMemo,
  useState,
  type ElementType
} from "react";
import {
  Blocks,
  Bot,
  Check,
  FileText,
  Globe2,
  Image,
  Loader2,
  PackagePlus,
  Plug,
  Plus,
  Search,
  Sparkles,
  TerminalSquare,
  X
} from "lucide-react";

import { cn } from "../lib/cn";
import { MessageResponse } from "@/components/ai-elements/message";
import type {
  CapabilityProvider,
  ComposerCapability,
  ComposerCapabilityCatalog,
  ComposerCapabilityCategory,
  ComposerCapabilityComponent,
  ComposerCapabilityKind
} from "../types";

type PluginsPageProps = {
  className?: string;
  agentServerUrl?: string;
  activeTab?: CatalogTab;
};

export type CatalogTab = ComposerCapabilityKind;
type CatalogFilter = "All" | "Installed" | "Recommended" | "Codex" | "Claude" | "Shared";
type CapabilityContentState =
  | { status: "idle"; content: string }
  | { status: "loading"; content: string }
  | { status: "loaded"; content: string }
  | { status: "error"; content: string };

const filters: CatalogFilter[] = [
  "All",
  "Installed",
  "Recommended",
  "Codex",
  "Claude",
  "Shared"
];
const categoryOrder: ComposerCapabilityCategory[] = ["Recommended", "System", "Personal"];
const emptyCatalog: ComposerCapabilityCatalog = { generatedAt: "", items: [] };

export function PluginsPage({
  className,
  agentServerUrl,
  activeTab: controlledActiveTab
}: PluginsPageProps) {
  const [internalActiveTab] = useState<CatalogTab>("plugin");
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const [filter, setFilter] = useState<CatalogFilter>("All");
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<ComposerCapabilityCatalog>(emptyCatalog);
  const [selectedItem, setSelectedItem] = useState<ComposerCapability | null>(null);
  const [selectedContent, setSelectedContent] = useState<CapabilityContentState>({
    status: "idle",
    content: ""
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      if (!agentServerUrl) {
        setCatalog(fallbackCatalog());
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${agentServerUrl}/api/capabilities`);

        if (!response.ok) {
          throw new Error(`Catalog request failed with ${response.status}`);
        }

        const nextCatalog = (await response.json()) as ComposerCapabilityCatalog;

        if (!cancelled) {
          setCatalog(nextCatalog);
        }
      } catch (catalogError) {
        if (!cancelled) {
          setError(catalogError instanceof Error ? catalogError.message : String(catalogError));
          setCatalog(fallbackCatalog());
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [agentServerUrl]);

  useEffect(() => {
    let cancelled = false;

    async function loadSelectedContent(item: ComposerCapability) {
      if (!item.path || !agentServerUrl) {
        setSelectedContent({
          status: "loaded",
          content: localCapabilityContent(item)
        });
        return;
      }

      setSelectedContent({ status: "loading", content: "" });

      try {
        const response = await fetch(
          `${agentServerUrl}/api/capabilities/content?path=${encodeURIComponent(item.path)}`
        );

        if (!response.ok) {
          throw new Error(`Content request failed with ${response.status}`);
        }

        const detail = (await response.json()) as { content?: string };

        if (!cancelled) {
          setSelectedContent({
            status: "loaded",
            content: detail.content?.trim() || localCapabilityContent(item)
          });
        }
      } catch (contentError) {
        if (!cancelled) {
          setSelectedContent({
            status: "error",
            content: contentError instanceof Error
              ? contentError.message
              : String(contentError)
          });
        }
      }
    }

    if (selectedItem) {
      void loadSelectedContent(selectedItem);
    }

    return () => {
      cancelled = true;
    };
  }, [agentServerUrl, selectedItem]);

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedItem(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedItem]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return catalog.items.filter((item) => {
      if (item.kind !== activeTab) {
        return false;
      }

      if (filter === "Installed" && !item.installed) {
        return false;
      }

      if (filter === "Recommended" && !item.recommended) {
        return false;
      }

      if (filter === "Codex" && !item.providers.includes("codex")) {
        return false;
      }

      if (filter === "Claude" && !item.providers.includes("claude")) {
        return false;
      }

      if (filter === "Shared" && item.source !== "shared") {
        return false;
      }

      return (
        !normalizedQuery ||
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.description.toLowerCase().includes(normalizedQuery) ||
        item.pluginName?.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [activeTab, catalog.items, filter, query]);

  const sections = categoryOrder
    .map((category) => ({
      category,
      items: filteredItems.filter((item) => item.category === category)
    }))
    .filter((section) => section.items.length > 0);

  return (
    <section
      className={cn(
        "h-full min-h-0 min-w-0 overflow-hidden bg-app-shell text-app-text",
        className
      )}
      aria-label="Plugins and skills"
    >
      <div className="thin-scrollbar h-full min-h-0 overflow-y-auto">
        <div className="mx-auto grid min-h-full w-full max-w-[900px] grid-rows-[auto_1fr] gap-8 px-6 pb-12 pt-9 max-[760px]:px-4 max-[760px]:pt-6">
          <div className="grid gap-7">
            <h1 className="text-center text-[28px] font-semibold leading-tight text-app-text">
              Make Composer work your way
            </h1>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <label className="grid h-9 grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-lg border border-app-line-strong bg-app-panel/55 px-3 text-app-dim shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                <Search size={15} />
                <input
                  className="h-full min-w-0 bg-transparent text-[14px] text-app-text outline-none placeholder:text-app-dim"
                  placeholder={`Search ${activeTab === "skill" ? "skills" : "plugins"}`}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <select
                className="h-9 min-w-[112px] rounded-lg border border-app-line-strong bg-app-panel/55 px-3 text-[14px] text-app-muted outline-none focus:border-app-blue/60"
                value={filter}
                onChange={(event) => setFilter(event.target.value as CatalogFilter)}
                aria-label="Catalog filter"
              >
                {filters.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid content-start gap-6">
            {error && (
              <div className="rounded-lg border border-amber-400/20 bg-amber-400/8 px-3 py-2 text-[13px] text-amber-100/80">
                Showing local fallback catalog. {error}
              </div>
            )}

            {loading && (
              <div className="grid gap-5">
                <SkeletonSection />
                <SkeletonSection />
              </div>
            )}

            {!loading && sections.length === 0 && (
              <div className="grid min-h-[220px] place-items-center border-t border-app-line text-center text-[14px] text-app-dim">
                No {activeTab === "skill" ? "skills" : "plugins"} match this view.
              </div>
            )}

            {!loading &&
              sections.map((section) => (
                <CatalogSection
                  key={section.category}
                  title={section.category}
                  items={section.items}
                  onSelect={setSelectedItem}
                />
              ))}
          </div>
        </div>
      </div>

      {selectedItem && (
        <CapabilityModal
          item={selectedItem}
          contentState={selectedContent}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </section>
  );
}

function CatalogSection({
  title,
  items,
  onSelect
}: {
  title: ComposerCapabilityCategory;
  items: ComposerCapability[];
  onSelect: (item: ComposerCapability) => void;
}) {
  return (
    <section className="grid gap-3" aria-label={title}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <h2 className="text-[14px] font-semibold text-app-muted">{title}</h2>
        <div className="h-px bg-app-line" />
      </div>
      <div className="grid grid-cols-2 gap-x-10 gap-y-2 max-[860px]:grid-cols-1">
        {items.map((item) => (
          <CapabilityRow key={item.id} item={item} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

function CapabilityRow({
  item,
  onSelect
}: {
  item: ComposerCapability;
  onSelect: (item: ComposerCapability) => void;
}) {
  const Icon = iconFor(item);

  return (
    <article
      className="grid min-h-[66px] min-w-0 cursor-pointer grid-cols-[40px_minmax(0,1fr)_28px] items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.045] focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item);
        }
      }}
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg border border-app-line text-app-text",
          iconSurface(item.iconKey)
        )}
      >
        <Icon size={18} />
      </span>

      <div className="grid min-w-0 gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-[14px] font-medium text-app-text">
            {item.name}
          </h3>
          <ProviderPills providers={item.providers} />
        </div>
        <p className="truncate text-[12.5px] leading-5 text-app-dim">
          {item.description}
        </p>
        {item.kind === "plugin" && item.components && item.components.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 pt-0.5">
            {item.components.slice(0, 4).map((component) => (
              <span
                key={component}
                className="rounded-md bg-white/[0.045] px-1.5 py-0.5 text-[11px] uppercase text-app-dim"
              >
                {componentLabel(component)}
              </span>
            ))}
          </div>
        )}
      </div>

      <button
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70",
          item.enabled
            ? "text-app-dim hover:bg-white/[0.06] hover:text-app-muted"
            : "bg-white/[0.055] text-app-muted hover:bg-white/[0.09]"
        )}
        aria-label={item.enabled ? `${item.name} enabled` : `Add ${item.name}`}
        type="button"
        onClick={(event) => event.stopPropagation()}
      >
        {item.enabled ? <Check size={16} /> : <Plus size={17} />}
      </button>
    </article>
  );
}

function CapabilityModal({
  item,
  contentState,
  onClose
}: {
  item: ComposerCapability;
  contentState: CapabilityContentState;
  onClose: () => void;
}) {
  const Icon = iconFor(item);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#02070d]/70 px-5 py-8 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="grid max-h-[86vh] w-full max-w-[780px] grid-rows-[auto_minmax(0,1fr)_auto] gap-7 rounded-[22px] border border-app-line-strong bg-app-panel p-7 shadow-[0_30px_120px_rgba(0,0,0,0.55)]"
        role="dialog"
        aria-modal="true"
        aria-label={`${item.name} details`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="grid gap-5">
          <div className="flex items-start justify-between gap-4">
            <span
              className={cn(
                "flex h-[54px] w-[54px] items-center justify-center rounded-2xl border border-app-line text-app-text",
                iconSurface(item.iconKey)
              )}
            >
              <Icon size={26} />
            </span>
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-white/[0.07] hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70"
              aria-label="Close capability details"
              type="button"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid gap-2">
            <div className="flex min-w-0 items-baseline gap-3">
              <h2 className="truncate text-[27px] font-semibold leading-tight text-app-text">
                {item.name}
              </h2>
              <span className="text-[22px] text-app-dim">
                {item.kind === "skill" ? "Skill" : "Plugin"}
              </span>
            </div>
            <p className="text-[19px] leading-7 text-app-muted">
              {item.description}
            </p>
          </div>
        </header>

        <div className="thin-scrollbar min-h-0 overflow-auto rounded-2xl border border-app-line bg-app-shell/70 p-5">
          {contentState.status === "loading" ? (
            <div className="grid min-h-[240px] place-items-center text-app-dim">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : contentState.status === "error" ? (
            <p className="text-[14px] leading-6 text-rose-200/90">
              {contentState.content}
            </p>
          ) : (
            <CapabilityMarkdown>{contentState.content}</CapabilityMarkdown>
          )}
        </div>

        <footer className="flex justify-end gap-2">
          <button
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[15px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70",
              item.enabled
                ? "bg-white/[0.08] text-app-muted hover:bg-white/[0.12] hover:text-app-text"
                : "bg-zinc-100 text-zinc-950 hover:bg-white"
            )}
            type="button"
          >
            {item.enabled ? <Check size={17} /> : <Plus size={18} />}
            <span>{item.enabled ? "Installed" : "Install"}</span>
          </button>
        </footer>
      </section>
    </div>
  );
}

function CapabilityMarkdown({ children }: { children: string }) {
  return (
    <MessageResponse
      className={cn(
        "composer-message-markdown min-w-0 text-[15px] leading-7 text-app-muted [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-app-line-strong [&_blockquote]:pl-3 [&_blockquote]:text-app-dim",
        "[&_code]:rounded-md [&_code]:bg-white/[0.08] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]",
        "[&_h1]:mb-3 [&_h1]:mt-5 [&_h1]:text-[22px] [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[18px] [&_h2]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-[16px] [&_h3]:font-semibold",
        "[&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-7 [&_p]:my-0 [&_p+p]:mt-3 [&_pre]:my-3 [&_pre]:max-w-full [&_pre]:overflow-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-app-line [&_pre]:bg-black/30 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
      )}
      controls={{
        code: { copy: false, download: false },
        table: { copy: false, download: false, fullscreen: false }
      }}
      parseIncompleteMarkdown={false}
    >
      {children}
    </MessageResponse>
  );
}

function ProviderPills({ providers }: { providers: CapabilityProvider[] }) {
  if (providers.length !== 1) {
    return null;
  }

  return (
    <span className="rounded-md bg-white/[0.045] px-1.5 py-0.5 text-[11px] uppercase text-app-dim">
      {providers[0]}
    </span>
  );
}

function SkeletonSection() {
  return (
    <div className="grid gap-4">
      <div className="h-px bg-app-line" />
      <div className="grid grid-cols-2 gap-x-14 gap-y-7 max-[860px]:grid-cols-1">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-[48px_minmax(0,1fr)_32px] items-center gap-3"
          >
            <div className="h-11 w-11 rounded-xl bg-white/[0.05]" />
            <div className="grid gap-2">
              <div className="h-4 w-1/2 rounded bg-white/[0.05]" />
              <div className="h-3 w-4/5 rounded bg-white/[0.035]" />
            </div>
            <div className="h-8 w-8 rounded-lg bg-white/[0.04]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function fallbackCatalog(): ComposerCapabilityCatalog {
  return {
    generatedAt: new Date().toISOString(),
    items: [
      {
        id: "fallback-pdf",
        kind: "skill",
        name: "PDF",
        description: "Create, edit, and review PDFs.",
        category: "Recommended",
        source: "marketplace",
        providers: ["codex", "claude"],
        iconKey: "pdf",
        installed: false,
        enabled: false,
        recommended: true,
        components: ["skills"]
      },
      {
        id: "fallback-playwright",
        kind: "skill",
        name: "Playwright",
        description: "Automate real browsers for app verification.",
        category: "Recommended",
        source: "marketplace",
        providers: ["codex", "claude"],
        iconKey: "playwright",
        installed: false,
        enabled: false,
        recommended: true,
        components: ["skills", "mcp"]
      }
    ]
  };
}

function localCapabilityContent(item: ComposerCapability) {
  const providers = item.providers
    .map((provider) => (provider === "codex" ? "Codex" : "Claude"))
    .join(" and ");
  const components = item.components?.length
    ? item.components.map(componentLabel).join(", ")
    : item.kind === "skill"
      ? "skills"
      : "plugin components";

  return [
    "## Overview",
    item.description,
    "",
    "## Availability",
    `This ${item.kind} is available to ${providers}.`,
    "",
    "## Components",
    components
  ].join("\n");
}

function iconFor(item: ComposerCapability): ElementType {
  switch (item.iconKey) {
    case "pdf":
    case "documents":
      return FileText;
    case "image":
      return Image;
    case "browser":
    case "playwright":
      return Globe2;
    case "github":
    case "terminal":
      return TerminalSquare;
    case "plugin":
      return Plug;
    case "vercel":
    case "expo":
      return Blocks;
    case "openai":
      return Bot;
    default:
      return item.kind === "plugin" ? PackagePlus : Sparkles;
  }
}

function iconSurface(iconKey?: string) {
  switch (iconKey) {
    case "pdf":
      return "bg-[#f45d5d]/18 text-[#ff8b8b]";
    case "image":
      return "bg-[#4fb6ff]/18 text-[#7fd0ff]";
    case "browser":
    case "playwright":
      return "bg-[#7986ff]/16 text-[#adb5ff]";
    case "documents":
      return "bg-[#3578ff]/18 text-[#7dabff]";
    case "github":
    case "terminal":
      return "bg-white/[0.045] text-zinc-300";
    case "vercel":
      return "bg-white/[0.06] text-zinc-100";
    case "expo":
      return "bg-[#f0bd5b]/14 text-[#ffd27a]";
    case "openai":
      return "bg-[#53d29d]/14 text-[#83e4bb]";
    case "plugin":
      return "bg-[#bb7cff]/14 text-[#d3adff]";
    default:
      return "bg-white/[0.045] text-zinc-300";
  }
}

function componentLabel(component: ComposerCapabilityComponent) {
  return component === "mcp" || component === "lsp"
    ? component.toUpperCase()
    : component;
}
