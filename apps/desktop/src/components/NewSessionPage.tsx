import {
  Blocks,
  GitBranch,
  Laptop
} from "lucide-react";

import { cn } from "../lib/cn";
import {
  PromptComposer,
  type PromptComposerControls,
  type PromptComposerFooterItem,
  type PromptComposerFooterOption
} from "./Composer";

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
  const footerItems: PromptComposerFooterItem[] = [
    {
      icon: Blocks,
      label: workspaceName,
      options: workspaceOptions,
      selectedOptionId: selectedWorkspaceId,
      searchPlaceholder: "Search projects",
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

        <div className="grid gap-4">
          <PromptComposer
            {...composer}
            className="max-w-[760px]"
            footerItems={footerItems}
            placeholder="Ask Composer anything. @ to use plugins or mention files"
            textareaRows={2}
          />
        </div>
      </div>
    </section>
  );
}
