import {
  Blocks,
  GitBranch,
  Laptop,
  X
} from "lucide-react";

import { cn } from "../lib/cn";
import { useComposerStore } from "../state/composer-store";
import { useOnboardingStore } from "../state/onboarding-store";
import {
  PromptComposer,
  type PromptComposerControls,
  type PromptComposerFooterItem,
  type PromptComposerFooterOption
} from "./Composer";
import { ProviderLogo } from "./ProviderLogo";
import { appHoverSurfaceSubtle, focusRing } from "./style-tokens";

type NewSessionPageProps = {
  className?: string;
  composer: PromptComposerControls;
  workspaceName?: string;
  workspaceOptions?: PromptComposerFooterOption[];
  selectedWorkspaceId?: string;
  workTargetFooterItem?: PromptComposerFooterItem;
  branchFooterItem?: PromptComposerFooterItem;
  onWorkspaceSelect?: (option: PromptComposerFooterOption) => void;
  onWorkspaceCreate?: (query: string) => void | Promise<void>;
  onWorkspaceUseExistingFolder?: () => void | Promise<void>;
};

// Divergence-friendly starter tasks: each is something where Codex and Claude
// tend to take meaningfully different approaches, so the first Compose run
// lands the "two agents, one task" aha. Clicking a chip fills the prompt and
// forces Compose mode.
const STARTER_PROMPTS: Array<{ label: string; prompt: string }> = [
  {
    label: "Explain this codebase",
    prompt:
      "Explain this codebase: the architecture, the key modules, and how they fit together."
  },
  {
    label: "Find a bug",
    prompt: "Find a likely bug in this codebase and propose a fix."
  },
  {
    label: "Add tests",
    prompt:
      "Add meaningful tests for an important but under-tested part of this codebase."
  },
  {
    label: "Refactor — compare approaches",
    prompt:
      "Refactor a complex part of this codebase. Walk through your approach and the trade-offs."
  }
];

export function NewSessionPage({
  className,
  composer,
  workspaceName = "Workspace",
  workspaceOptions,
  selectedWorkspaceId,
  workTargetFooterItem,
  branchFooterItem,
  onWorkspaceSelect,
  onWorkspaceCreate,
  onWorkspaceUseExistingFolder
}: NewSessionPageProps) {
  const setPrompt = useComposerStore((state) => state.setPrompt);
  const seenCompareExplainer = useOnboardingStore(
    (state) => state.seenCompareExplainer
  );
  const dismissCompareExplainer = useOnboardingStore(
    (state) => state.dismissCompareExplainer
  );

  const showCompareExplainer =
    composer.provider === "meta" && !seenCompareExplainer;

  function startWith(prompt: string) {
    if (composer.disabled) {
      return;
    }

    setPrompt(prompt);
    // Starter prompts are designed to showcase Compose, so always run the first
    // one in parallel even if the user previously switched to a single engine.
    composer.setProvider("meta");
  }

  const footerItems: PromptComposerFooterItem[] = [
    {
      icon: Blocks,
      label: workspaceName,
      options: workspaceOptions,
      selectedOptionId: selectedWorkspaceId,
      searchPlaceholder: "Search projects",
      showOptionDetails: false,
      createLabel: "New project",
      menuPlacement: "down",
      onSelect: onWorkspaceSelect,
      onCreate: onWorkspaceCreate,
      onUseExistingFolder: onWorkspaceUseExistingFolder
    },
    workTargetFooterItem ?? {
      icon: Laptop,
      label: "Work locally",
      menuPlacement: "down"
    },
    branchFooterItem ?? { icon: GitBranch, label: "Branch" }
  ];

  return (
    <section
      className={cn(
        "relative grid h-full min-h-0 min-w-0 place-items-center overflow-hidden",
        className
      )}
      aria-label="New agent session"
    >
      <div className="grid w-full max-w-[760px] gap-5 px-5 pb-[9vh]">
        <h1 className="text-center text-[25px] font-medium leading-tight text-app-text">
          What should we build in {workspaceName}?
        </h1>

        {showCompareExplainer && (
          <div className="mx-auto flex max-w-[560px] items-center gap-2.5 rounded-full border border-app-line bg-app-text/[0.04] py-1.5 pl-3 pr-2 text-[13px] text-app-muted">
            <ProviderLogo provider="meta" className="h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="text-app-text">Compose</span> runs Codex and
              Claude in parallel — keep the better answer, or hand off to braid
              them.
            </span>
            <button
              type="button"
              className={cn(
                "ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:text-app-text",
                appHoverSurfaceSubtle,
                focusRing
              )}
              onClick={dismissCompareExplainer}
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        )}

        <div className="grid gap-4">
          <PromptComposer
            {...composer}
            className="max-w-[760px]"
            footerItems={footerItems}
            placeholder="Ask Composer anything. Mention files when needed"
            textareaRows={2}
          />

          <div className="flex flex-wrap justify-center gap-2">
            {STARTER_PROMPTS.map((starter) => (
              <button
                key={starter.label}
                type="button"
                className={cn(
                  "rounded-full border border-app-line bg-transparent px-3 py-1.5 text-[12.5px] text-app-muted transition-colors hover:border-app-line hover:text-app-text",
                  appHoverSurfaceSubtle,
                  focusRing,
                  "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-app-muted"
                )}
                disabled={composer.disabled}
                onClick={() => startWith(starter.prompt)}
              >
                {starter.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
