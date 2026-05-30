"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Columns2,
  FolderOpen,
  HelpCircle,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  SquareTerminal,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Palette + provider marks lifted from the real Composer desktop app  */
/* (apps/desktop/src/styles.css + ProviderLogo.tsx) so this reads as a  */
/* true replica: neutral zinc-dark surfaces, monochrome provider logos. */
/* shell #0f0f10 · sidebar #1b1b1c · panel #242425 · line rgba(255 255  */
/* 255 / .09) · text #e4e4e7 · muted #a1a1aa · dim #71717a · success    */
/* #71d697 · warning(Claude) #d97757 · danger #f87171                   */
/* ------------------------------------------------------------------ */

type Provider = "claude" | "codex";

const providerMeta: Record<
  Provider,
  { name: string; tint: string; model: string }
> = {
  claude: { name: "Claude", tint: "text-[#d97757]", model: "Claude Opus 4.8" },
  codex: { name: "Codex", tint: "text-[#c4c4cb]", model: "GPT-5.4 Codex" },
};

function ClaudeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  );
}

function OpenAIMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="M11.248 18.25q-.825 0-1.568-.314a4.3 4.3 0 0 1-1.32-.874 4 4 0 0 1-1.304.214 4 4 0 0 1-2.046-.544 4.27 4.27 0 0 1-1.518-1.485 4 4 0 0 1-.56-2.095q0-.48.131-1.04A4.4 4.4 0 0 1 2.04 10.71a4.07 4.07 0 0 1 .017-3.4 4.2 4.2 0 0 1 1.056-1.418 3.8 3.8 0 0 1 1.6-.842 3.9 3.9 0 0 1 .76-1.683q.593-.759 1.451-1.188a4.04 4.04 0 0 1 1.832-.429q.825 0 1.567.313.742.314 1.32.875a4 4 0 0 1 1.304-.215q1.106 0 2.046.545a4.14 4.14 0 0 1 1.501 1.485q.578.941.578 2.095 0 .48-.132 1.04.66.61 1.023 1.419.363.792.363 1.666 0 .892-.38 1.717a4.3 4.3 0 0 1-1.072 1.435 3.8 3.8 0 0 1-1.584.825 3.8 3.8 0 0 1-.775 1.683 4.06 4.06 0 0 1-1.436 1.188 4.04 4.04 0 0 1-1.832.429m-4.076-2.062q.825 0 1.435-.347l3.103-1.782a.36.36 0 0 0 .164-.313v-1.42L7.881 14.62a.67.67 0 0 1-.726 0l-3.118-1.798a.5.5 0 0 1-.017.115v.198q0 .841.396 1.551.413.693 1.139 1.089a3.2 3.2 0 0 0 1.617.412m.165-2.69a.4.4 0 0 0 .181.05q.083 0 .165-.05l1.238-.71-3.977-2.31a.7.7 0 0 1-.363-.643v-3.58q-.825.362-1.32 1.122a2.9 2.9 0 0 0-.495 1.65q0 .809.413 1.55.412.743 1.072 1.123zm3.91 3.663q.875 0 1.585-.396a2.96 2.96 0 0 0 1.534-2.64v-3.564a.32.32 0 0 0-.165-.297l-1.254-.726v4.604a.7.7 0 0 1-.363.643l-3.119 1.799a3 3 0 0 0 1.783.577m.627-6.039V8.878L10.01 7.822 8.129 8.878v2.244l1.881 1.056zM7.057 5.859a.7.7 0 0 1 .363-.644l3.119-1.798a3 3 0 0 0-1.782-.578q-.874 0-1.584.396A2.96 2.96 0 0 0 6.05 4.324a3.07 3.07 0 0 0-.396 1.551v3.547q0 .199.165.314l1.237.726zm8.383 7.887q.825-.364 1.303-1.123.495-.758.495-1.65a3.15 3.15 0 0 0-.412-1.55q-.413-.743-1.073-1.123l-3.086-1.782q-.099-.065-.181-.049a.3.3 0 0 0-.165.05l-1.238.692 3.993 2.327a.6.6 0 0 1 .264.264.64.64 0 0 1 .1.363zm-3.317-8.382a.63.63 0 0 1 .726 0l3.135 1.831v-.297q0-.792-.396-1.501a2.86 2.86 0 0 0-1.105-1.155q-.71-.43-1.65-.43-.825 0-1.436.347L8.294 5.941a.36.36 0 0 0-.165.314v1.418z" />
    </svg>
  );
}

function ProviderMark({
  provider,
  className = "size-3.5",
}: {
  provider: Provider;
  className?: string;
}) {
  const tinted = `${className} ${providerMeta[provider].tint}`;
  return provider === "claude" ? (
    <ClaudeMark className={tinted} />
  ) : (
    <OpenAIMark className={tinted} />
  );
}

// Render `inline code` spans (matches the app's --app-code-bg treatment).
function renderInline(text: string): ReactNode {
  if (!text.includes("`")) {
    return text;
  }
  return text.split(/(`[^`]+`)/).map((part, index) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
      <code
        key={index}
        className="rounded bg-[rgba(255,255,255,0.07)] px-1 py-0.5 font-mono text-[12px] text-[#e4e4e7]"
      >
        {part.slice(1, -1)}
      </code>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Window chrome                                                       */
/* ------------------------------------------------------------------ */

function TrafficLights() {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      <span className="size-3 rounded-full bg-[#ff5f57]" />
      <span className="size-3 rounded-full bg-[#febc2e]" />
      <span className="size-3 rounded-full bg-[#28c840]" />
    </div>
  );
}

function GhostIcon({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex size-7 cursor-pointer items-center justify-center rounded-lg text-[#71717a] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[#e4e4e7] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(255,255,255,0.3)]"
    >
      {children}
    </button>
  );
}

// Top chrome zone that sits above the sidebar: traffic lights, nav, toggle.
// No bottom border — the column's vertical dividers run unbroken to the top.
function SidebarChrome() {
  return (
    <div className="flex h-11 items-center gap-0.5 px-3.5">
      <TrafficLights />
      <span className="w-1.5" />
      <GhostIcon>
        <ArrowLeft className="size-4" aria-hidden="true" />
      </GhostIcon>
      <GhostIcon>
        <ArrowRight className="size-4" aria-hidden="true" />
      </GhostIcon>
      <GhostIcon>
        <PanelLeft className="size-4" aria-hidden="true" />
      </GhostIcon>
    </div>
  );
}

// Top chrome zone above the main pane: session title + window actions.
function MainChrome({ title }: { title: string }) {
  return (
    <div className="flex h-11 items-center gap-1.5 px-4">
      <span className="truncate text-[12.5px] text-[#e4e4e7]">{title}</span>
      <GhostIcon>
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </GhostIcon>
      <span className="ml-auto flex items-center gap-1">
        <GhostIcon>
          <Plus className="size-4" aria-hidden="true" />
        </GhostIcon>
        <GhostIcon>
          <Columns2 className="size-4" aria-hidden="true" />
        </GhostIcon>
        <GhostIcon>
          <PanelRight className="size-4" aria-hidden="true" />
        </GhostIcon>
      </span>
    </div>
  );
}

// Simple chrome for the small workflow mini-mocks.
function WindowChrome({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-[rgba(255,255,255,0.09)] px-3.5 py-2.5">
      <TrafficLights />
      <span className="ml-2 truncate text-[11px] text-[#71717a]">{title}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Conversation primitives                                             */
/* ------------------------------------------------------------------ */

function UserRow({ text, time }: { text: string; time?: string }) {
  return (
    <div className="mock-item-in flex flex-col items-end gap-1">
      <p className="max-w-[80%] rounded-2xl bg-[rgba(255,255,255,0.06)] px-3.5 py-2 text-[13px] leading-5 text-[#e4e4e7]">
        {text}
      </p>
      {time && <span className="pr-1 text-[10.5px] text-[#71717a]">{time}</span>}
    </div>
  );
}

function ToolRow({ label, running }: { label: string; running: boolean }) {
  return (
    <button
      type="button"
      className="mock-item-in flex w-fit max-w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left text-[#71717a] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[#a1a1aa]"
    >
      <SquareTerminal className="size-4 shrink-0" aria-hidden="true" />
      <span className={`truncate text-[13px] text-[#a1a1aa] ${running ? "mock-shimmer" : ""}`}>
        {label}
      </span>
      <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
    </button>
  );
}

function MessageRow({
  provider,
  text,
  streaming = false,
}: {
  provider: Provider;
  text: string;
  streaming?: boolean;
}) {
  return (
    <div className="mock-item-in flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-[#a1a1aa]">
        <ProviderMark provider={provider} className="size-3.5" />
        {providerMeta[provider].name}
      </span>
      <p className="text-[13.5px] leading-[1.55] text-[#e4e4e7]/95">
        {renderInline(text)}
        {streaming && <span className="mock-caret">&nbsp;</span>}
      </p>
    </div>
  );
}

function HandoffRow({ to }: { to: Provider }) {
  return (
    <div className="mock-item-in flex items-center gap-2.5">
      <span className="h-px flex-1 bg-[rgba(255,255,255,0.09)]" />
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1 text-[12px] text-[#a1a1aa]">
        <ArrowRight className="size-3 text-[#71717a]" aria-hidden="true" />
        Handed off to
        <ProviderMark provider={to} className="size-3" />
        <span className="text-[#e4e4e7]">{providerMeta[to].name}</span>
      </span>
      <span className="h-px flex-1 bg-[rgba(255,255,255,0.09)]" />
    </div>
  );
}

function DiffCard({ file, add, del }: { file: string; add: number; del: number }) {
  return (
    <button
      type="button"
      className="mock-item-in block w-full max-w-[440px] cursor-pointer overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.09)] bg-[rgba(255,255,255,0.02)] text-left transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.09)] px-3 py-1.5 text-[12px]">
        <span className="text-[#a1a1aa]">1 file changed</span>
        <span className="font-mono">
          <span className="text-[#71d697]">+{add}</span>{" "}
          <span className="text-[#f87171]">-{del}</span>
        </span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 font-mono text-[11.5px]">
        <span className="text-[#a1a1aa]">{file}</span>
        <span className="ml-auto">
          <span className="text-[#71d697]">+{add}</span>{" "}
          <span className="text-[#f87171]">-{del}</span>
        </span>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

function SidebarItem({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="flex min-h-7 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1 text-left text-[13px] text-[#a1a1aa] transition-colors hover:bg-[rgba(228,228,231,0.06)] hover:text-[#e4e4e7]"
    >
      <span className="text-[#71717a]">{icon}</span>
      {label}
    </button>
  );
}

function Sidebar() {
  const threads = [
    { name: "auth flow refactor", provider: "codex" as Provider, age: "now", active: true, running: false, subagent: false },
    { name: "billing webhook", provider: "claude" as Provider, age: "12m", active: false, running: false, subagent: false },
    { name: "expiry tests", provider: "codex" as Provider, age: "1h", active: false, running: true, subagent: true },
  ];
  return (
    <aside className="hidden w-48 shrink-0 flex-col border-r border-[rgba(255,255,255,0.09)] bg-[#1b1b1c] sm:flex">
      <SidebarChrome />
      <div className="flex flex-col gap-0.5 px-2.5 pb-3 pt-1">
        <SidebarItem icon={<Pencil className="size-[15px]" aria-hidden="true" />} label="New session" />
        <SidebarItem icon={<Search className="size-[15px]" aria-hidden="true" />} label="Search" />
      </div>

      <div className="flex-1 px-2.5">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1 py-1 text-[12px] text-[#71717a] transition-colors hover:text-[#a1a1aa]"
        >
          <span className="flex-1 text-left">Workspaces</span>
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </button>
        <div className="mt-0.5 flex flex-col gap-0.5">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 rounded-md py-1 pl-2 pr-1 text-[13px] text-[#a1a1aa] transition-colors hover:bg-[rgba(228,228,231,0.05)] hover:text-[#e4e4e7]"
          >
            <FolderOpen className="size-[15px] shrink-0 text-[#71717a]" aria-hidden="true" />
            <span className="truncate">auth-service</span>
            <Plus className="ml-auto size-3.5 shrink-0 text-[#71717a]" aria-hidden="true" />
          </button>
          {threads.map((thread) => (
            <button
              type="button"
              key={thread.name}
              className={`grid w-full cursor-pointer grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2 rounded-md py-1 pl-[26px] pr-2 text-left text-[12.5px] transition-colors ${
                thread.active
                  ? "bg-[rgba(228,228,231,0.08)] text-[#e4e4e7]"
                  : "text-[rgba(161,161,170,0.78)] hover:bg-[rgba(228,228,231,0.05)] hover:text-[#e4e4e7]"
              }`}
            >
              <ProviderMark provider={thread.provider} className="size-3 shrink-0" />
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{thread.name}</span>
                {thread.subagent && (
                  <span className="shrink-0 rounded-sm border border-[rgba(255,255,255,0.12)] px-1 text-[8.5px] uppercase tracking-[0.04em] text-[#71717a]">
                    Subagent
                  </span>
                )}
              </span>
              {thread.running ? (
                <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-[#71d697]" />
              ) : (
                <span className="shrink-0 text-[10.5px] text-[#71717a]">{thread.age}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1 border-t border-[rgba(255,255,255,0.09)] px-2 py-1.5 text-[#71717a]">
        <GhostIcon>
          <HelpCircle className="size-[15px]" aria-hidden="true" />
        </GhostIcon>
        <GhostIcon>
          <Settings className="size-[15px]" aria-hidden="true" />
        </GhostIcon>
        <span className="ml-auto pr-1 text-[11px]">v0.1.61</span>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Composer footer                                                     */
/* ------------------------------------------------------------------ */

function ControlPill({
  children,
  className = "",
  hideOnNarrow = false,
}: {
  children: ReactNode;
  className?: string;
  hideOnNarrow?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${hideOnNarrow ? "hidden sm:inline-flex" : "inline-flex"} h-[28px] cursor-pointer items-center gap-1.5 rounded-full border border-[rgba(255,255,255,0.1)] px-2.5 text-[12.5px] transition-colors hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(255,255,255,0.05)] ${className}`}
    >
      {children}
    </button>
  );
}

function ComposerBar({
  text,
  caret,
  provider,
}: {
  text: string;
  caret: boolean;
  provider: Provider;
}) {
  return (
    <div className="border-t border-[rgba(255,255,255,0.09)] p-2.5">
      <div className="rounded-[16px] border border-[rgba(255,255,255,0.09)] bg-[rgba(255,255,255,0.02)] px-3.5 py-3">
        <p className="min-h-5 text-[13px] leading-5 text-[#e4e4e7]">
          {text || (
            <span className="text-[#71717a]">
              Ask Composer to build, debug, or review
            </span>
          )}
          {caret && <span className="mock-caret">&nbsp;</span>}
        </p>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5">
          <div className="flex min-w-0 flex-nowrap items-center gap-2">
            <button
              type="button"
              className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[rgba(255,255,255,0.1)] text-[#a1a1aa] transition-colors hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#e4e4e7]"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
            <ControlPill className="text-[#d97757]">
              <ShieldAlert className="size-3.5" aria-hidden="true" />
              Full access
              <ChevronDown className="size-3 text-[#71717a]" aria-hidden="true" />
            </ControlPill>
            <ControlPill className="bg-[rgba(255,255,255,0.04)] text-[#e4e4e7] transition-colors duration-300">
              <ProviderMark provider={provider} className="size-3.5" />
              {providerMeta[provider].name}
              <ChevronDown className="size-3 text-[#71717a]" aria-hidden="true" />
            </ControlPill>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ControlPill className="max-w-[150px] text-[#a1a1aa]" hideOnNarrow>
              <Bot className="size-3.5 shrink-0 text-[#71717a]" aria-hidden="true" />
              <span className="truncate">{providerMeta[provider].model}</span>
            </ControlPill>
            <ControlPill className="text-[#a1a1aa]" hideOnNarrow>
              High
              <ChevronDown className="size-3 text-[#71717a]" aria-hidden="true" />
            </ControlPill>
            <button
              type="button"
              className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#e4e4e7] text-[#0f0f10] transition-colors hover:bg-white"
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Review / diff inspector pane (right column, like the app's ReviewPanel) */
/* ------------------------------------------------------------------ */

const DIFF_LINES: Array<{ type: "ctx" | "add" | "del"; text: string }> = [
  { type: "ctx", text: "async function refreshToken() {" },
  { type: "del", text: "  return session.token;" },
  { type: "add", text: "  if (session.expired()) {" },
  { type: "add", text: "    return renew(session);" },
  { type: "add", text: "  }" },
  { type: "add", text: "  return session.token;" },
  { type: "ctx", text: "}" },
];

function ReviewPane({ active }: { active: boolean }) {
  return (
    <aside className="hidden w-[300px] shrink-0 flex-col border-l border-[rgba(255,255,255,0.09)] bg-[#0f0f10] lg:flex">
      <div className="flex h-11 items-center gap-2 px-3.5">
        <span className="text-[12.5px] text-[#e4e4e7]">Review</span>
        {active && (
          <span className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[11.5px]">
              <span className="text-[#71d697]">+24</span>{" "}
              <span className="text-[#f87171]">-6</span>
            </span>
            <GhostIcon>
              <X className="size-3.5" aria-hidden="true" />
            </GhostIcon>
            <GhostIcon>
              <Check className="size-3.5" aria-hidden="true" />
            </GhostIcon>
          </span>
        )}
      </div>
      <div className="flex-1 overflow-hidden p-2.5">
        {active ? (
          <div className="mock-item-in overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.09)]">
            <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.09)] bg-[rgba(255,255,255,0.02)] px-2.5 py-1.5 font-mono text-[11px]">
              <span className="text-[#a1a1aa]">auth.ts</span>
              <span>
                <span className="text-[#71d697]">+24</span>{" "}
                <span className="text-[#f87171]">-6</span>
              </span>
            </div>
            <div className="font-mono text-[10.5px] leading-[1.7]">
              {DIFF_LINES.map((line, index) => (
                <div
                  key={index}
                  className={`flex gap-2 px-2 ${
                    line.type === "add"
                      ? "bg-[rgba(113,214,151,0.12)] text-[#a9e4c0]"
                      : line.type === "del"
                        ? "bg-[rgba(248,113,113,0.12)] text-[#e7a3a3]"
                        : "text-[#71717a]"
                  }`}
                >
                  <span className="select-none text-[#71717a]">
                    {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                  </span>
                  <span className="whitespace-pre">{line.text}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-[12px] leading-5 text-[#71717a]">
            Changes appear here as the agents edit your code.
          </div>
        )}
      </div>
    </aside>
  );
}

function MockFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[12px] border border-[rgba(255,255,255,0.12)] bg-[#0f0f10] shadow-[0_24px_70px_-28px_rgba(0,0,0,0.55)] ${className}`}
      style={{
        backgroundImage:
          "radial-gradient(circle at 22% 0%, rgba(255,255,255,0.04), transparent 42%)",
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Animated hero mock — replays the Claude -> Codex handoff            */
/* ------------------------------------------------------------------ */

type Item =
  | { id: number; kind: "user"; text: string; time?: string }
  | { id: number; kind: "tool"; label: string; running: boolean }
  | { id: number; kind: "msg"; provider: Provider; text: string; streaming: boolean }
  | { id: number; kind: "handoff"; to: Provider }
  | { id: number; kind: "diff"; file: string; add: number; del: number };

const PROMPT = "Refactor the auth flow and add tests.";
const CLAUDE_PLAN =
  "Plan: extract the token refresh into a guarded `refreshToken()` helper, then cover the expiry path with tests.";
const CODEX_WORK =
  "Implemented the guarded `refreshToken()` and added expiry + retry tests in `auth.test.ts`. All green.";
const PROMPT2 = "Now make sure the refresh retries once on a 401.";
const CODEX_TEST =
  "Added a single retry on a 401 with short backoff; re-ran the suite and all 14 tests still pass.";
const CLAUDE_REVIEW =
  "Reviewed the change — looks solid. One edge case: cap retries so a persistently expired token can't loop.";

const FINAL_ITEMS: Item[] = [
  { id: 1, kind: "user", text: PROMPT, time: "11:10 PM" },
  { id: 2, kind: "tool", label: "Read 4 files", running: false },
  { id: 3, kind: "msg", provider: "claude", text: CLAUDE_PLAN, streaming: false },
  { id: 4, kind: "handoff", to: "codex" },
  { id: 5, kind: "tool", label: "Edited 3 files", running: false },
  { id: 6, kind: "msg", provider: "codex", text: CODEX_WORK, streaming: false },
  { id: 7, kind: "diff", file: "auth.ts", add: 24, del: 6 },
  { id: 8, kind: "user", text: PROMPT2, time: "11:12 PM" },
  { id: 9, kind: "tool", label: "Ran npm test — 14 passed", running: false },
  { id: 10, kind: "msg", provider: "codex", text: CODEX_TEST, streaming: false },
  { id: 11, kind: "handoff", to: "claude" },
  { id: 12, kind: "msg", provider: "claude", text: CLAUDE_REVIEW, streaming: false },
];

function renderItem(item: Item) {
  switch (item.kind) {
    case "user":
      return <UserRow key={item.id} text={item.text} time={item.time} />;
    case "tool":
      return <ToolRow key={item.id} label={item.label} running={item.running} />;
    case "msg":
      return (
        <MessageRow
          key={item.id}
          provider={item.provider}
          text={item.text}
          streaming={item.streaming}
        />
      );
    case "handoff":
      return <HandoffRow key={item.id} to={item.to} />;
    case "diff":
      return <DiffCard key={item.id} file={item.file} add={item.add} del={item.del} />;
    default:
      return null;
  }
}

export function HeroMock() {
  const [items, setItems] = useState<Item[]>([]);
  const [composer, setComposer] = useState("");
  const [provider, setProvider] = useState<Provider>("claude");
  const [caret, setCaret] = useState(false);
  const [reviewActive, setReviewActive] = useState(false);

  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Keep the transcript pinned to the bottom as items stream in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [items]);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      setItems(FINAL_ITEMS);
      setProvider("codex");
      setReviewActive(true);
      return;
    }

    cancelledRef.current = false;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        timerRef.current = setTimeout(resolve, ms);
      });
    const active = () => !cancelledRef.current;

    async function typePrompt(full: string) {
      setCaret(true);
      for (let i = 1; i <= full.length; i += 1) {
        if (!active()) return;
        setComposer(full.slice(0, i));
        await sleep(34);
      }
    }

    async function streamMessage(id: number, full: string) {
      const words = full.split(" ");
      let acc = "";
      for (let i = 0; i < words.length; i += 1) {
        if (!active()) return;
        acc = acc ? `${acc} ${words[i]}` : words[i];
        const snapshot = acc;
        setItems((current) =>
          current.map((item) =>
            item.id === id && item.kind === "msg" ? { ...item, text: snapshot } : item,
          ),
        );
        await sleep(50);
      }
      if (!active()) return;
      setItems((current) =>
        current.map((item) =>
          item.id === id && item.kind === "msg" ? { ...item, streaming: false } : item,
        ),
      );
    }

    async function run() {
      while (active()) {
        setItems([]);
        setComposer("");
        setProvider("claude");
        setReviewActive(false);
        await sleep(500);

        await typePrompt(PROMPT);
        await sleep(420);
        setCaret(false);
        setComposer("");
        setItems([{ id: 1, kind: "user", text: PROMPT, time: "11:10 PM" }]);
        await sleep(520);

        setItems((c) => [
          ...c,
          { id: 2, kind: "tool", label: "Reading auth.ts, session.ts…", running: true },
        ]);
        await sleep(900);
        setItems((c) =>
          c.map((i) =>
            i.id === 2 && i.kind === "tool" ? { ...i, label: "Read 4 files", running: false } : i,
          ),
        );
        await sleep(280);
        setItems((c) => [...c, { id: 3, kind: "msg", provider: "claude", text: "", streaming: true }]);
        await streamMessage(3, CLAUDE_PLAN);
        await sleep(620);

        setItems((c) => [...c, { id: 4, kind: "handoff", to: "codex" }]);
        await sleep(340);
        setProvider("codex");
        await sleep(440);

        setItems((c) => [
          ...c,
          { id: 5, kind: "tool", label: "Editing auth flow…", running: true },
        ]);
        await sleep(900);
        setItems((c) =>
          c.map((i) =>
            i.id === 5 && i.kind === "tool" ? { ...i, label: "Edited 3 files", running: false } : i,
          ),
        );
        await sleep(280);
        setItems((c) => [...c, { id: 6, kind: "msg", provider: "codex", text: "", streaming: true }]);
        await streamMessage(6, CODEX_WORK);
        await sleep(280);
        setItems((c) => [...c, { id: 7, kind: "diff", file: "auth.ts", add: 24, del: 6 }]);
        setReviewActive(true);
        await sleep(1500);

        // Second prompt — a follow-up that Codex executes, then hands back.
        await typePrompt(PROMPT2);
        await sleep(380);
        setCaret(false);
        setComposer("");
        setItems((c) => [...c, { id: 8, kind: "user", text: PROMPT2, time: "11:12 PM" }]);
        await sleep(480);

        setItems((c) => [...c, { id: 9, kind: "tool", label: "Running npm test…", running: true }]);
        await sleep(950);
        setItems((c) =>
          c.map((i) =>
            i.id === 9 && i.kind === "tool"
              ? { ...i, label: "Ran npm test — 14 passed", running: false }
              : i,
          ),
        );
        await sleep(260);
        setItems((c) => [...c, { id: 10, kind: "msg", provider: "codex", text: "", streaming: true }]);
        await streamMessage(10, CODEX_TEST);
        await sleep(600);

        // Hand back to Claude for the review pass.
        setItems((c) => [...c, { id: 11, kind: "handoff", to: "claude" }]);
        await sleep(340);
        setProvider("claude");
        await sleep(440);
        setItems((c) => [...c, { id: 12, kind: "msg", provider: "claude", text: "", streaming: true }]);
        await streamMessage(12, CLAUDE_REVIEW);

        await sleep(3200);
      }
    }

    void run();

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <MockFrame className="w-full text-left">
      <div className="flex h-[740px]">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <MainChrome title="auth flow refactor" />
          <div
            ref={scrollRef}
            className="mock-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4"
          >
            {items.map(renderItem)}
          </div>
          <ComposerBar text={composer} caret={caret} provider={provider} />
        </div>
        <ReviewPane active={reviewActive} />
      </div>
    </MockFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Static workflow mini-mocks                                          */
/* ------------------------------------------------------------------ */

type MiniStep =
  | { kind: "msg"; provider: Provider; text: string }
  | { kind: "tool"; label: string }
  | { kind: "handoff"; to: Provider }
  | { kind: "diff"; file: string; add: number; del: number };

/* Parallel "start both, pick one" view: one prompt, two provider columns,
   each with a "Continue with X" button to adopt that thread. */
function ParallelColumn({
  provider,
  model,
  tool,
  text,
  className = "",
}: {
  provider: Provider;
  model: string;
  tool: string;
  text: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-[#a1a1aa]">
        <ProviderMark provider={provider} className="size-3.5" />
        {providerMeta[provider].name}
        <span className="font-normal text-[#71717a]">{model} · Low</span>
      </span>
      <ToolRow label={tool} running={false} />
      <p className="text-[12.5px] leading-[1.5] text-[#e4e4e7]/95">{text}</p>
      <button
        type="button"
        className="mt-auto flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-[12.5px] text-[#e4e4e7] transition-colors hover:bg-[rgba(255,255,255,0.06)]"
      >
        <Check className="size-3.5 text-[#71d697]" aria-hidden="true" />
        Continue with {providerMeta[provider].name}
      </button>
    </div>
  );
}

export function ParallelMock() {
  return (
    <MockFrame className="w-full text-left">
      <WindowChrome title="Composer · parallel" />
      <div className="px-3.5 py-3.5">
        <div className="mb-4 flex justify-end">
          <p className="rounded-2xl bg-[rgba(255,255,255,0.06)] px-3 py-1.5 text-[12.5px] text-[#e4e4e7]">
            What&apos;s this project about?
          </p>
        </div>
        <div className="grid grid-cols-2">
          <ParallelColumn
            provider="codex"
            model="GPT-5.5"
            tool="Ran 3 commands"
            text="Composer is a multi-provider coding agent — a desktop app, a CLI, and a shared local runtime."
            className="pr-3.5"
          />
          <ParallelColumn
            provider="claude"
            model="Sonnet 4.6"
            tool="Ran 1 command, used 2 tools"
            text="A monorepo: an Electron desktop app, a React/Ink CLI, and a Next.js landing page."
            className="border-l border-[rgba(255,255,255,0.09)] pl-3.5"
          />
        </div>
      </div>
    </MockFrame>
  );
}

export function WorkflowMock({ steps }: { steps: MiniStep[] }) {
  return (
    <MockFrame className="w-full text-left">
      <WindowChrome title="Composer" />
      <div className="space-y-3 px-3.5 py-3.5">
        {steps.map((step, index) => {
          switch (step.kind) {
            case "msg":
              return <MessageRow key={index} provider={step.provider} text={step.text} />;
            case "tool":
              return <ToolRow key={index} label={step.label} running={false} />;
            case "handoff":
              return <HandoffRow key={index} to={step.to} />;
            case "diff":
              return <DiffCard key={index} file={step.file} add={step.add} del={step.del} />;
            default:
              return null;
          }
        })}
      </div>
    </MockFrame>
  );
}

export type { MiniStep };
