import type { ElementType, ReactNode } from "react";
import {
  Archive,
  ArrowLeft,
  BriefcaseBusiness,
  ChevronDown,
  CircleGauge,
  Code2,
  FileTerminal,
  FolderGit2,
  GitBranch,
  Laptop,
  MousePointer2,
  PanelTop,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
  Workflow
} from "lucide-react";

import { cn } from "../lib/cn";

type SettingsPageProps = {
  className?: string;
  onBack: () => void;
};

type SettingsNavItem = {
  icon: ElementType;
  label: string;
  active?: boolean;
};

const settingsNav: SettingsNavItem[] = [
  { icon: Settings, label: "General", active: true },
  { icon: Sun, label: "Appearance" },
  { icon: ShieldCheck, label: "Configuration" },
  { icon: UserRound, label: "Personalization" },
  { icon: Workflow, label: "MCP servers" },
  { icon: GitBranch, label: "Git" },
  { icon: Laptop, label: "Environments" },
  { icon: FolderGit2, label: "Worktrees" },
  { icon: PanelTop, label: "Browser use" },
  { icon: MousePointer2, label: "Computer use" },
  { icon: Archive, label: "Archived chats" },
  { icon: CircleGauge, label: "Usage" }
];

export function SettingsPage({ className, onBack }: SettingsPageProps) {
  return (
    <section
      className={cn(
        "grid h-full min-h-0 w-full grid-cols-[280px_minmax(0,1fr)] overflow-hidden bg-app-shell text-app-text max-[780px]:grid-cols-1",
        className
      )}
      aria-label="Settings"
    >
      <aside className="min-h-0 border-r border-app-line bg-app-sidebar/88 max-[780px]:hidden">
        <div className="thin-scrollbar flex h-full flex-col overflow-y-auto px-2.5 pb-5 pt-[58px]">
          <button
            className="mb-5 inline-flex h-9 w-fit items-center gap-2 rounded-lg px-2.5 text-[15px] text-app-dim transition-colors hover:bg-white/[0.05] hover:text-app-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70"
            onClick={onBack}
          >
            <ArrowLeft size={14} />
            <span>Back to app</span>
          </button>

          <nav className="grid gap-1" aria-label="Settings sections">
            {settingsNav.map((item) => (
              <SettingsNavButton key={item.label} {...item} />
            ))}
          </nav>
        </div>
      </aside>

      <div className="thin-scrollbar min-h-0 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-[690px] gap-10 px-8 pb-20 pt-[82px] max-[780px]:px-5 max-[780px]:pt-6">
          <button
            className="hidden h-9 w-fit items-center gap-2 rounded-lg px-2.5 text-[15px] text-app-muted transition-colors hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70 max-[780px]:inline-flex"
            onClick={onBack}
          >
            <ArrowLeft size={14} />
            <span>Back to app</span>
          </button>

          <h1 className="text-[24px] font-semibold leading-none text-zinc-200">
            General
          </h1>

          <section className="grid gap-4" aria-labelledby="work-mode-heading">
            <div className="grid gap-2">
              <h2
                id="work-mode-heading"
                className="text-[15px] font-semibold text-zinc-300"
              >
                Work mode
              </h2>
              <p className="text-[15px] text-app-dim">
                Choose how much technical detail Composer shows
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3.5 max-[640px]:grid-cols-1">
              <WorkModeCard
                active
                icon={FileTerminal}
                title="For coding"
                description="More technical responses and control"
              />
              <WorkModeCard
                icon={BriefcaseBusiness}
                title="For everyday work"
                description="Same power, less technical detail"
              />
            </div>
          </section>

          <SettingsSection title="Permissions">
            <SettingsRow
              title="Default permissions"
              description="By default, Composer can read and edit files in its workspace. It can ask for additional access when needed"
              trailing={<Switch enabled muted />}
            />
            <SettingsRow
              title="Auto-review"
              description={
                <>
                  Composer can read and edit files in its workspace. Composer
                  automatically reviews requests for additional access.
                  Auto-review can make mistakes.{" "}
                  <span className="text-app-blue">Learn more</span> about
                  elevated risks.
                </>
              }
              trailing={<Switch enabled />}
            />
            <SettingsRow
              title="Full access"
              description={
                <>
                  When Composer runs with full access, it can edit any file on your
                  computer and run commands with network, without your approval.
                  This significantly increases the risk of data loss, leaks, or
                  unexpected behavior.{" "}
                  <span className="text-app-blue">Learn more</span> about
                  elevated risks.
                </>
              }
              trailing={<Switch enabled />}
            />
          </SettingsSection>

          <SettingsSection title="General">
            <SettingsRow
              title="Default open destination"
              description="Where files and folders open by default"
              trailing={<SelectValue icon={Code2} value="Windsurf" />}
            />
            <SettingsRow
              title="Language"
              description="Language for the app UI"
              trailing={<SelectValue value="Auto Detect" />}
            />
            <SettingsRow
              title="Show in menu bar"
              description="Keep Composer in the macOS menu bar when the main window is closed"
              trailing={<Switch enabled />}
            />
            <SettingsRow
              title="Popout Window hotkey"
              description="Set a global shortcut for Popout Window. Leave unset to keep it off."
              trailing={<HotkeyValue />}
            />
            <SettingsRow
              title="Prevent sleep while running"
              description="Keep your computer awake while Composer is running a chat"
              trailing={<Switch />}
            />
            <SettingsRow
              title="Require ⌘ + enter to send long prompts"
              description="When enabled, multiline prompts require ⌘ + enter to send"
              trailing={<Switch />}
            />
          </SettingsSection>
        </div>
      </div>
    </section>
  );
}

function SettingsNavButton({ icon: Icon, label, active }: SettingsNavItem) {
  return (
    <button
      className={cn(
        "grid min-h-9 w-full grid-cols-[22px_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[15px] text-zinc-300/86 transition-colors hover:bg-white/[0.05]",
        active && "bg-white/[0.08] text-zinc-100"
      )}
    >
      <Icon className="text-zinc-300/85" size={14} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function WorkModeCard({
  icon: Icon,
  title,
  description,
  active
}: {
  icon: ElementType;
  title: string;
  description: string;
  active?: boolean;
}) {
  return (
    <button
      className={cn(
        "grid min-h-[74px] grid-cols-[24px_minmax(0,1fr)_22px] items-center gap-3 rounded-lg border px-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70",
        active
          ? "border-app-line bg-white/[0.08]"
          : "border-app-line bg-transparent hover:bg-white/[0.04]"
      )}
      aria-pressed={active}
    >
      <Icon size={15} className="text-zinc-300" />
      <span className="grid gap-1">
        <span className="text-[14px] font-medium text-zinc-200">{title}</span>
        <span className="text-[13px] leading-5 text-app-dim">
          {description}
        </span>
      </span>
      <span
        className={cn(
          "flex h-[19px] w-[19px] items-center justify-center rounded-full border",
          active
            ? "border-[#7d86ff] bg-[#6974ea]"
            : "border-app-line-strong"
        )}
      >
        {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
    </button>
  );
}

function SettingsSection({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-5" aria-labelledby={`${title}-settings`}>
      <h2
        id={`${title}-settings`}
        className="text-[16px] font-semibold text-zinc-300"
      >
        {title}
      </h2>
      <div className="overflow-hidden rounded-lg border border-app-line bg-white/[0.035]">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  title,
  description,
  trailing
}: {
  title: string;
  description?: ReactNode;
  trailing: ReactNode;
}) {
  return (
    <div className="grid min-h-[74px] grid-cols-[minmax(0,1fr)_auto] items-center gap-5 border-b border-app-line px-4 py-3 last:border-b-0">
      <span className="grid min-w-0 gap-1.5">
        <span className="text-[14px] font-medium text-zinc-300">{title}</span>
        {description && (
          <span className="max-w-[560px] text-[13.5px] leading-5 text-app-dim">
            {description}
          </span>
        )}
      </span>
      {trailing}
    </div>
  );
}

function SelectValue({
  icon: Icon,
  value
}: {
  icon?: ElementType;
  value: string;
}) {
  return (
    <button className="inline-flex h-8 min-w-[190px] items-center justify-between gap-2 rounded-lg bg-white/[0.055] px-3 text-[14px] text-zinc-300">
      <span className="inline-flex min-w-0 items-center gap-2">
        {Icon && <Icon size={14} className="shrink-0 text-zinc-200" />}
        <span className="truncate">{value}</span>
      </span>
      <ChevronDown size={13} className="shrink-0 text-app-dim" />
    </button>
  );
}

function HotkeyValue() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-[14px] text-app-dim">Off</span>
      <button className="h-8 rounded-lg bg-white/[0.06] px-3 text-[14px] text-zinc-300">
        Set
      </button>
    </span>
  );
}

function Switch({ enabled, muted }: { enabled?: boolean; muted?: boolean }) {
  return (
    <span
      role="switch"
      aria-checked={Boolean(enabled)}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 rounded-full transition-colors",
        enabled
          ? muted
            ? "bg-[#6974ea]/70"
            : "bg-[#6974ea]"
          : "bg-white/[0.12]"
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-transform",
          enabled ? "translate-x-[18px]" : "translate-x-[2px]"
        )}
      />
    </span>
  );
}
