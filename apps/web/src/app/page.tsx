"use client";

import Image from "next/image";
import { useState, type ElementType, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Blocks,
  Bot,
  ChevronDown,
  Check,
  CheckCircle2,
  Code2,
  Download,
  Edit3,
  FileCode2,
  FolderOpen,
  GitBranch,
  Laptop,
  Layers3,
  MessageSquare,
  MessageSquarePlus,
  Mic,
  Monitor,
  PanelRight,
  Play,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const navItems = [
  { label: "Workflow", href: "#workflow" },
  { label: "Desktop", href: "#desktop" },
  { label: "Agents", href: "#agents" },
];

const metrics = [
  { value: "04", label: "active sessions" },
  { value: "18", label: "files in context" },
  { value: "02", label: "changes ready" },
];

type PreviewThread = {
  id: string;
  name: string;
  age: string;
};

const previewWorkspaces: { name: string; threads: PreviewThread[] }[] = [
  {
    name: "composer-ade",
    threads: [
      {
        id: "implement-workspace-indexing",
        name: "Implement workspace indexing",
        age: "now",
      },
      {
        id: "design-usage-analytics",
        name: "Design usage analytics",
        age: "5d",
      },
    ],
  },
  {
    name: "web-dashboard",
    threads: [
      {
        id: "review-checkout-redesign",
        name: "Review checkout redesign",
        age: "1d",
      },
      {
        id: "fix-preview-auth-flow",
        name: "Fix preview auth flow",
        age: "3d",
      },
    ],
  },
];

const workflow = [
  {
    icon: MessageSquare,
    label: "Describe the change",
    detail:
      "Start with intent, constraints, files, and acceptance criteria in one focused session.",
  },
  {
    icon: Bot,
    label: "Let agents work",
    detail:
      "Run implementation, investigation, and review agents without losing the project thread.",
  },
  {
    icon: CheckCircle2,
    label: "Review then ship",
    detail:
      "Inspect terminal output, diffs, and decisions before moving the work forward.",
  },
];

const featureGroups = [
  {
    eyebrow: "Local first",
    title: "Your real workspace stays visible.",
    detail:
      "Composer keeps the repo, shell, prompts, and running agent sessions together so every decision is grounded in the code on disk.",
    icon: Monitor,
  },
  {
    eyebrow: "Agent native",
    title: "Parallel work without scattered context.",
    detail:
      "Spin up focused agents for exploration, implementation, and verification while keeping the handoff readable.",
    icon: Layers3,
  },
  {
    eyebrow: "Ship ready",
    title: "Approvals, diffs, and output in one loop.",
    detail:
      "Move from prompt to patch with a desktop surface designed for review, not blind automation.",
    icon: ShieldCheck,
  },
];

const agentRows = [
  ["Explore API route ownership", "Explorer", "Done"],
  ["Patch landing page hero", "Worker", "Running"],
  ["Verify Vercel deployment", "Reviewer", "Queued"],
];

const checkpoints = [
  "Read the repo before writing code",
  "Keep shell output and browser checks attached",
  "Preserve user changes in the working tree",
  "Review generated patches before committing",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#07111c] text-[#e7edf5]">
      <section className="hero-stage relative isolate overflow-hidden">
        <HeroAtmosphere />

        <header className="mx-auto flex w-full max-w-[1500px] items-center justify-between px-5 py-5 sm:px-8">
          <a className="flex items-center gap-3" href="#top" aria-label="Composer home">
            <Image
              src="/composer-icon.png"
              alt=""
              width={36}
              height={36}
              className="size-9 rounded-md"
              priority
            />
            <span className="text-base font-semibold">Composer</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm text-[#f6f3ea]/64 md:flex">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="transition hover:text-[#f6f3ea]">
                {item.label}
              </a>
            ))}
          </nav>
          <a
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#f6f3ea]/16 bg-[#f6f3ea]/5 px-4 text-sm font-medium text-[#f6f3ea] transition hover:border-[#f6f3ea]/34 hover:bg-[#f6f3ea]/10"
            href="#download"
          >
            <Download className="size-4" aria-hidden="true" />
            Download
          </a>
        </header>

        <div
          id="top"
          className="mx-auto grid w-full max-w-[1500px] items-center gap-12 px-5 pb-12 pt-12 sm:px-8 lg:min-h-[calc(100svh-80px)] lg:grid-cols-[0.58fr_1.42fr] lg:pb-16 lg:pt-6"
        >
          <div className="max-w-2xl">
            <p className="mb-5 inline-flex items-center gap-2 rounded-md border border-[#65a7ff]/24 bg-[#65a7ff]/10 px-3 py-1.5 text-sm font-medium text-[#9dc8ff]">
              <Sparkles className="size-4" aria-hidden="true" />
              The Composer desktop app
            </p>
            <h1 className="text-5xl font-semibold leading-[1.02] sm:text-6xl lg:text-[64px]">
              Build with agents.
              <span className="block text-[#65a7ff]">Stay in Composer.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#f6f3ea]/72">
              Composer is the local desktop surface for starting agent sessions,
              keeping workspace context visible, and reviewing the work before it
              lands in your repo.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#f6f3ea] px-5 text-sm font-semibold text-[#0f1115] transition hover:bg-white"
                href="#download"
              >
                <Download className="size-4" aria-hidden="true" />
                Get Composer
              </a>
              <a
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-[#f6f3ea]/16 px-5 text-sm font-semibold text-[#f6f3ea] transition hover:border-[#f6f3ea]/34 hover:bg-[#f6f3ea]/8"
                href="#workflow"
              >
                <Play className="size-4" aria-hidden="true" />
                See the loop
              </a>
            </div>
            <div className="mt-10 hidden max-w-lg grid-cols-3 gap-px overflow-hidden rounded-lg border border-[#f6f3ea]/10 bg-[#f6f3ea]/10 sm:grid">
              {metrics.map((metric) => (
                <div key={metric.label} className="bg-[#0d1015]/88 px-4 py-3">
                  <p className="font-mono text-xl text-[#f6f3ea]">{metric.value}</p>
                  <p className="mt-1 text-xs text-[#f6f3ea]/48">{metric.label}</p>
                </div>
              ))}
            </div>
          </div>

          <ProductStage />
        </div>

        <div className="mx-auto grid max-w-[1500px] grid-cols-2 gap-px border-y border-[#f6f3ea]/10 bg-[#f6f3ea]/10 px-0 sm:grid-cols-4 lg:mb-10">
          {["Repo context", "Parallel agents", "Diff review", "Vercel ready"].map(
            (item) => (
              <div key={item} className="bg-[#090b0e] px-5 py-4 text-sm text-[#f6f3ea]/62 sm:px-8">
                {item}
              </div>
            ),
          )}
        </div>
      </section>

      <section id="workflow" className="bg-[#f4f0e6] text-[#111317]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase text-[#176341]">Workflow</p>
              <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight sm:text-4xl">
                The coding loop, designed around decisions.
              </h2>
            </div>
            <p className="max-w-2xl text-base leading-7 text-[#111317]/66">
              The references focus on agentic work as a product surface. Composer
              brings that same clarity to the desktop: one place to steer, inspect,
              and finish the work.
            </p>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-[#111317]/12 bg-[#111317]/12 md:grid-cols-3">
            {workflow.map((item, index) => {
              const Icon = item.icon;
              return (
                <article key={item.label} className="bg-[#f9f6ee] p-6">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-[#111317]/42">
                      0{index + 1}
                    </span>
                    <span className="inline-flex size-9 items-center justify-center rounded-md bg-[#111317] text-[#f6f3ea]">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                  </div>
                  <h3 className="mt-10 text-xl font-semibold">{item.label}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#111317]/62">
                    {item.detail}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="desktop" className="bg-[#101217] text-[#f6f3ea]">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase text-[#8fd4ff]">Desktop</p>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight sm:text-4xl">
              A quieter surface for serious agent work.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#f6f3ea]/62">
              Composer avoids the split-brain workflow of browser tabs, terminals,
              and detached prompts. The project stays close while agents do the
              heavy lifting.
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-lg border border-[#f6f3ea]/10 bg-[#f6f3ea]/10">
            {featureGroups.map((feature) => {
              const Icon = feature.icon;
              return (
                <article
                  key={feature.title}
                  className="grid gap-4 bg-[#151922] p-5 sm:grid-cols-[44px_1fr]"
                >
                  <span className="inline-flex size-11 items-center justify-center rounded-md bg-[#f6f3ea] text-[#101217]">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase text-[#8fd4ff]">
                      {feature.eyebrow}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#f6f3ea]/58">
                      {feature.detail}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="agents" className="bg-[#08090b] text-[#f6f3ea]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1.02fr_0.98fr]">
          <AgentConsole />
          <div className="flex flex-col justify-center">
            <p className="text-sm font-semibold uppercase text-[#f2c46d]">Agents</p>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight sm:text-4xl">
              Delegate without losing the thread.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#f6f3ea]/62">
              Composer gives every agent a defined role, visible progress, and a
              place to hand back evidence. You keep the final call.
            </p>
            <ul className="mt-8 grid gap-3">
              {checkpoints.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-[#f6f3ea]/70">
                  <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded bg-[#1f3c2b] text-[#b8ffca]">
                    <Check className="size-3.5" aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="download" className="bg-[#f4f0e6] text-[#111317]">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-20 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-[#176341]">Composer</p>
            <h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">
              Bring agentic coding into your local workflow.
            </h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#111317] px-5 text-sm font-semibold text-[#f6f3ea] transition hover:bg-black"
              href="#"
            >
              <Download className="size-4" aria-hidden="true" />
              Download app
            </a>
            <a
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-[#111317]/16 px-5 text-sm font-semibold text-[#111317] transition hover:border-[#111317]/34 hover:bg-[#111317]/5"
              href="https://github.com/atemaguer/composer"
            >
              <Code2 className="size-4" aria-hidden="true" />
              View source
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

function HeroAtmosphere() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_0%,rgba(38,91,138,0.22),transparent_34%),linear-gradient(180deg,#07111c_0%,#091522_54%,#07111c_100%)]" />
      <div className="absolute left-0 right-0 top-0 h-px bg-[#f6f3ea]/16" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#07111c] to-transparent" />
      <div className="absolute right-[8%] top-[16%] h-72 w-72 rotate-12 border border-[#65a7ff]/12" />
      <div className="absolute right-[18%] top-[24%] h-44 w-44 -rotate-6 border border-[#71d697]/12" />
    </div>
  );
}

function ProductStage() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const selectedThread =
    previewWorkspaces
      .flatMap((workspace) => workspace.threads)
      .find((thread) => thread.id === selectedThreadId) ?? null;

  return (
    <div
      className="relative flex min-h-[430px] items-center sm:min-h-[540px] lg:min-h-[690px]"
      aria-label="Composer product preview"
    >
      <div className="relative mx-auto w-full max-w-[1080px] overflow-hidden rounded-xl border border-[#b4cce8]/18 bg-[#091522] shadow-[0_34px_120px_rgba(0,0,0,0.56)] lg:mx-0">
        <div className="grid h-[620px] grid-cols-[244px_minmax(0,1fr)] max-sm:h-[430px] max-sm:grid-cols-[76px_minmax(0,1fr)]">
          <aside className="flex min-w-0 flex-col overflow-hidden bg-[#101923]/90">
            <div className="flex h-11 shrink-0 items-center gap-1.5 px-2 sm:pl-[86px]">
              <MockIconButton>
                <PanelRight className="size-3.5 rotate-180" aria-hidden="true" />
              </MockIconButton>
              <MockIconButton muted>
                <ArrowLeft className="size-4" aria-hidden="true" />
              </MockIconButton>
              <MockIconButton muted>
                <ArrowRight className="size-4" aria-hidden="true" />
              </MockIconButton>
            </div>

            <div className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-2 pb-2.5 pt-3">
              <nav className="grid gap-1" aria-label="Composer preview primary">
                <MockSidebarButton
                  active={!selectedThread}
                  icon={Edit3}
                  label="New session"
                  onClick={() => setSelectedThreadId(null)}
                />
                <MockSidebarButton icon={Search} label="Search" />
                <MockSidebarButton icon={Blocks} label="Plugins" />
              </nav>

              <div className="grid gap-1 max-sm:hidden">
                <div className="flex h-7 items-center justify-between rounded-md px-2 text-[13px] text-[#747e8e]">
                  <span>Workspaces</span>
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                </div>
                {previewWorkspaces.map((workspace) => (
                  <MockWorkspace
                    key={workspace.name}
                    name={workspace.name}
                    threads={workspace.threads}
                    selectedThreadId={selectedThreadId}
                    onThreadSelect={setSelectedThreadId}
                  />
                ))}
              </div>

              <div className="mt-auto">
                <MockSidebarButton icon={Settings} label="Settings" />
              </div>
            </div>
          </aside>

          <div className="grid min-w-0 grid-rows-[44px_minmax(0,1fr)] bg-[#091522]">
            <header className="flex h-11 items-center justify-between px-3">
              <div className="hidden min-w-0 items-center gap-2 text-[13px] font-semibold text-[#e7edf5]/80 sm:flex">
                <span className="truncate">{selectedThread?.name ?? "New session"}</span>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <MockIconButton>
                  <Plus className="size-3.5" aria-hidden="true" />
                </MockIconButton>
                <MockIconButton>
                  <PanelRight className="size-3.5" aria-hidden="true" />
                </MockIconButton>
              </div>
            </header>

            <section className="relative min-h-0 overflow-hidden">
              <div key={selectedThread?.id ?? "new"} className="h-full animate-[composerSessionIn_240ms_ease-out]">
                {selectedThread ? (
                  <MockSessionPage thread={selectedThread} />
                ) : (
                  <MockNewSessionPage />
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockNewSessionPage() {
  return (
    <div className="grid h-full place-items-center px-5 pb-[11vh]">
      <div className="grid w-full max-w-[820px] gap-5">
        <h3 className="text-center text-[25px] font-medium leading-tight text-zinc-200 max-sm:text-[18px]">
          What should we build in Workspace?
        </h3>
        <MockPromptComposer placeholder="Ask Composer anything. @ to use plugins or mention files" />
        <div className="flex items-center gap-5 px-3.5 pt-2 text-[13px] text-zinc-500 max-sm:hidden">
          <MockFooterPill icon={Blocks} label="Workspace" />
          <MockFooterPill icon={Laptop} label="Work locally" />
          <MockFooterPill icon={GitBranch} label="main" />
        </div>
      </div>
    </div>
  );
}

function MockSessionPage({ thread }: { thread: PreviewThread }) {
  return (
    <div className="relative grid h-full grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
      <div className="thin-scrollbar overflow-hidden px-5 pb-[180px] pt-6">
        <div className="mx-auto grid w-full max-w-[840px] gap-4">
          <div className="ml-auto max-w-[74%] rounded-2xl bg-[#65a7ff]/15 px-4 py-3 text-[13px] leading-6 text-[#dbeaff]">
            Continue work on <span className="font-semibold">{thread.name}</span>.
            Check the current diff, run the local checks, and call out anything
            that needs review.
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.035] p-4">
            <p className="text-[12px] uppercase tracking-wide text-[#747e8e]">
              Working for 2m 18s
            </p>
            <p className="mt-3 max-w-[640px] text-[13px] leading-6 text-[#cbd5e1]">
              I read the workspace state, found the web app entry point, and am
              updating the landing page hero to match Composer&apos;s actual desktop
              surface.
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#07111c]/78 p-3">
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <span className="inline-flex items-center gap-2 text-[#e7edf5]/80">
                <FileCode2 className="size-3.5 text-[#71d697]" aria-hidden="true" />
                Edited 2 files
              </span>
              <span className="font-mono text-[12px] text-[#71d697]">+146</span>
            </div>
            <div className="mt-3 overflow-hidden rounded-md border border-white/[0.06] font-mono text-[12px] leading-5">
              <div className="grid grid-cols-[44px_20px_minmax(0,1fr)] border-l-4 border-[#71d697] bg-[#71d697]/14 px-2">
                <span className="text-right text-[#71d697]">352</span>
                <span className="text-zinc-500">+</span>
                <code className="truncate text-zinc-300">setSelectedThreadId(thread.id)</code>
              </div>
              <div className="grid grid-cols-[44px_20px_minmax(0,1fr)] border-l-4 border-[#65a7ff] bg-[#65a7ff]/10 px-2">
                <span className="text-right text-[#65a7ff]">415</span>
                <span className="text-zinc-500">+</span>
                <code className="truncate text-zinc-300">render session timeline</code>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-[#d97757]/20 bg-[#d97757]/10 p-3 text-[13px] text-[#f2b29c]">
            Approval required: run <span className="font-mono">npm run build:web</span>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(9,21,34,0),rgba(9,21,34,0.92)_38%,#091522_100%)] px-5 pb-4 pt-16">
        <MockPromptComposer
          compact
          placeholder="Ask Composer to continue, verify, or review"
        />
      </div>
    </div>
  );
}

function MockPromptComposer({
  compact = false,
  placeholder,
}: {
  compact?: boolean;
  placeholder: string;
}) {
  return (
    <div
      className={[
        "pointer-events-auto mx-auto w-full rounded-2xl border border-white/[0.09] bg-[#1a2c42] px-3 py-2 shadow-[0_16px_44px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.04)]",
        compact ? "max-w-[820px]" : "",
      ].join(" ")}
    >
      <div className="min-h-7 rounded-md px-1 text-[13px] leading-6 text-zinc-500 max-sm:text-[11px]">
        {placeholder}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <MockIconButton>
            <Plus className="size-4" aria-hidden="true" />
          </MockIconButton>
          <span className="inline-flex h-[30px] min-w-0 items-center gap-1.5 rounded-full bg-[#d97757]/10 px-2.5 text-[13px] text-[#d97757] max-sm:w-8 max-sm:justify-center max-sm:px-0">
            <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate max-sm:hidden">Full</span>
            <ChevronDown className="size-3.5 shrink-0 max-sm:hidden" aria-hidden="true" />
          </span>
          <div className="inline-flex h-[26px] items-center rounded-full bg-white/[0.05] p-0.5 text-[12px] text-zinc-400">
            <span className="rounded-full bg-white/[0.08] px-2 py-1 text-zinc-200">
              Codex
            </span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <span className="h-3.5 w-3.5 rounded-full border-[3px] border-white/10 border-t-white/35 max-sm:hidden" />
          <span className="inline-flex h-[30px] max-w-[164px] items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 text-[13px] text-zinc-200 max-sm:w-8 max-sm:justify-center max-sm:px-0">
            <Bot className="hidden size-3.5 max-sm:block" aria-hidden="true" />
            <span className="truncate max-sm:hidden">GPT-5.4</span>
            <em className="not-italic text-zinc-500 max-sm:hidden">Medium</em>
            <ChevronDown className="size-3.5 shrink-0 max-sm:hidden" aria-hidden="true" />
          </span>
          <MockIconButton>
            <Mic className="size-3.5" aria-hidden="true" />
          </MockIconButton>
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-800 max-sm:size-8">
            <ArrowUp className="size-4" aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}

function MockIconButton({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex h-7 w-[30px] items-center justify-center rounded-[7px] border border-white/[0.09] bg-white/[0.035]",
        muted ? "text-zinc-500/70" : "text-zinc-300/80",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function MockSidebarButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon: ElementType;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "grid min-h-7 w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors hover:bg-white/[0.05]",
        active ? "bg-white/[0.08] text-[#e7edf5]" : "text-zinc-300/85",
      ].join(" ")}
    >
      <Icon className="size-3.5 text-zinc-400/85" aria-hidden="true" />
      <span className="truncate max-sm:hidden">{label}</span>
    </button>
  );
}

function MockWorkspace({
  name,
  threads,
  selectedThreadId,
  onThreadSelect,
}: {
  name: string;
  threads: PreviewThread[];
  selectedThreadId: string | null;
  onThreadSelect: (threadId: string) => void;
}) {
  return (
    <div className="grid gap-0.5">
      <div className="grid min-h-7 grid-cols-[17px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1 text-[13px] text-[#aab4c3]">
        <FolderOpen className="size-3.5 text-zinc-400/85" aria-hidden="true" />
        <span className="truncate">{name}</span>
        <MessageSquarePlus className="size-3.5 text-zinc-500" aria-hidden="true" />
      </div>
      <div className="grid gap-1">
        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            onClick={() => onThreadSelect(thread.id)}
            className={[
              "grid min-h-7 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md py-1 pl-9 pr-1 text-left text-[13px] transition-colors hover:bg-white/[0.05]",
              selectedThreadId === thread.id
                ? "bg-white/[0.08] text-[#e7edf5]"
                : "text-zinc-300/70",
            ].join(" ")}
          >
            <span className="inline-flex size-3.5 items-center justify-center text-zinc-300">
              <OpenAILogo />
            </span>
            <span className="truncate">{thread.name}</span>
            <em className="text-[12px] not-italic text-zinc-500">{thread.age}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function MockFooterPill({
  icon: Icon,
  label,
}: {
  icon: ElementType;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
      <ChevronDown className="size-3.5" aria-hidden="true" />
    </span>
  );
}

function OpenAILogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-3.5 fill-current">
      <path d="M11.248 18.25q-.825 0-1.568-.314a4.3 4.3 0 0 1-1.32-.874 4 4 0 0 1-1.304.214 4 4 0 0 1-2.046-.544 4.27 4.27 0 0 1-1.518-1.485 4 4 0 0 1-.56-2.095q0-.48.131-1.04A4.4 4.4 0 0 1 2.04 10.71a4.07 4.07 0 0 1 .017-3.4 4.2 4.2 0 0 1 1.056-1.418 3.8 3.8 0 0 1 1.6-.842 3.9 3.9 0 0 1 .76-1.683q.593-.759 1.451-1.188a4.04 4.04 0 0 1 1.832-.429q.825 0 1.567.313.742.314 1.32.875a4 4 0 0 1 1.304-.215q1.106 0 2.046.545a4.14 4.14 0 0 1 1.501 1.485q.578.941.578 2.095 0 .48-.132 1.04.66.61 1.023 1.419.363.792.363 1.666 0 .892-.38 1.717a4.3 4.3 0 0 1-1.072 1.435 3.8 3.8 0 0 1-1.584.825 3.8 3.8 0 0 1-.775 1.683 4.06 4.06 0 0 1-1.436 1.188 4.04 4.04 0 0 1-1.832.429" />
    </svg>
  );
}

function AgentConsole() {
  return (
    <div className="rounded-lg border border-[#f6f3ea]/10 bg-[#11151c] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#f6f3ea]/10 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase text-[#f2c46d]">Run queue</p>
          <h3 className="mt-2 text-xl font-semibold">Three agents, one workspace</h3>
        </div>
        <span className="inline-flex items-center gap-2 rounded-md bg-[#f6f3ea]/8 px-3 py-2 text-xs text-[#f6f3ea]/62">
          <GitBranch className="size-4" aria-hidden="true" />
          main
        </span>
      </div>

      <div className="mt-5 grid gap-3">
        {agentRows.map(([task, role, status]) => (
          <div
            key={task}
            className="grid gap-3 rounded-md border border-[#f6f3ea]/10 bg-[#171c25] p-4 sm:grid-cols-[1fr_96px_86px] sm:items-center"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-[#f6f3ea] text-[#111317]">
                {role === "Worker" ? (
                  <FileCode2 className="size-4" aria-hidden="true" />
                ) : role === "Reviewer" ? (
                  <PanelRight className="size-4" aria-hidden="true" />
                ) : (
                  <Bot className="size-4" aria-hidden="true" />
                )}
              </span>
              <span className="text-sm text-[#f6f3ea]/82">{task}</span>
            </div>
            <span className="font-mono text-xs text-[#f6f3ea]/48">{role}</span>
            <span
              className={[
                "inline-flex w-fit rounded px-2 py-1 text-xs",
                status === "Done"
                  ? "bg-[#1b3626] text-[#b8ffca]"
                  : status === "Running"
                    ? "bg-[#1a2d43] text-[#8fd4ff]"
                    : "bg-[#33271a] text-[#f2c46d]",
              ].join(" ")}
            >
              {status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
