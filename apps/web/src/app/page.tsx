import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightLeft,
  ClipboardX,
  GitBranch,
  Repeat2,
  Split,
  Terminal
} from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f5f7fb] text-[#172033]">
      <LandingHeader />

      <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-5 pb-16 pt-16 text-center sm:px-8 sm:pb-24 sm:pt-24">
        <h1 className="max-w-5xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Seamless Claude and Codex handoff.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-[#657188] sm:text-lg">
          Start in Claude, continue in Codex, then switch back on the next
          prompt. Composer carries the context so you do not have to re-explain
          the work in another terminal.
        </p>

        <a
          className="mt-12 block w-full cursor-zoom-in"
          href="#composer-screenshot"
          aria-label="Open Composer screenshot in full view"
        >
          <Image
            src="/composer-session.png"
            alt="Composer desktop thread session"
            width={3104}
            height={2024}
            className="h-auto w-full"
            priority
            unoptimized
          />
        </a>
      </section>

      <div
        id="composer-screenshot"
        className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#101010]/0 px-3 py-5 opacity-0 transition duration-200 target:pointer-events-auto target:bg-[#101010]/92 target:opacity-100 sm:px-8"
        aria-label="Composer screenshot full view"
      >
        <a
          className="absolute inset-0 cursor-zoom-out"
          href="#"
          aria-label="Close full view"
        />
        <div className="relative max-h-full w-full max-w-[min(96vw,1600px)]">
          <a
            className="absolute right-3 top-3 z-10 inline-flex size-8 items-center justify-center rounded-full bg-black/70 text-lg leading-none text-white transition hover:bg-black"
            href="#"
            aria-label="Close full view"
          >
            ×
          </a>
          <Image
            src="/composer-session.png"
            alt="Composer desktop thread session"
            width={3104}
            height={2024}
            className="max-h-[92vh] w-full rounded-xl object-contain shadow-2xl"
            unoptimized
          />
        </div>
      </div>

      <section
        id="use-cases"
        className="bg-[#eaf0f8] px-5 py-16 text-[#172033] sm:px-8 sm:py-24"
      >
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end">
            <div>
              <p className="font-mono text-sm text-[#657188]">Workflows</p>
              <h2 className="mt-5 max-w-3xl text-4xl font-semibold leading-none tracking-tight text-balance sm:text-6xl">
                The handoffs people already do by hand.
              </h2>
            </div>
            <p className="max-w-xl text-base leading-7 text-[#657188] lg:justify-self-end">
              Composer turns the copy-paste relay between Claude and Codex
              terminals into one continuous agent thread.
            </p>
          </div>

          <div className="mt-12 bg-[#172033] p-5 text-white sm:p-6">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto_1fr_auto_minmax(220px,0.75fr)] lg:items-center">
              <div className="bg-[#f0a07b] p-4 text-[#2d160d]">
                <Terminal className="size-5" aria-hidden="true" />
                <p className="mt-8 font-mono text-sm">Claude terminal</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">
                  Plan
                </p>
              </div>
              <ArrowRightLeft
                className="mx-auto size-5 text-[#d8dee8] max-lg:rotate-90"
                aria-hidden="true"
              />
              <div className="bg-[#8fb7ff] p-4 text-[#0d1b35]">
                <Terminal className="size-5" aria-hidden="true" />
                <p className="mt-8 font-mono text-sm">Codex terminal</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">
                  Review
                </p>
              </div>
              <div className="hidden h-24 w-px bg-white/14 lg:block" />
              <div className="grid gap-3 border border-white/12 bg-white/5 p-4">
                <div className="flex items-center gap-3 text-[#d8dee8]">
                  <ClipboardX
                    className="size-5 text-[#ffb4a0]"
                    aria-hidden="true"
                  />
                  <span className="font-mono text-sm">No pasted summary</span>
                </div>
                <p className="text-sm leading-6 text-[#aab4c3]">
                  Same task, next agent, no terminal-to-terminal reconstruction.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              {
                step: "01",
                title: "Plan, then review",
                left: "Plan",
                right: "Review",
                description:
                  "Have one agent sketch the approach and the other challenge it before code changes start.",
                outcome: "Second pass before code",
                Icon: GitBranch,
                color: "bg-[#f0a07b]"
              },
              {
                step: "02",
                title: "Plan, then execute",
                left: "Plan",
                right: "Execute",
                description:
                  "Hand a plan from Claude to Codex, or from Codex to Claude, and let the next agent run with it.",
                outcome: "Another agent runs with it",
                Icon: ArrowRightLeft,
                color: "bg-[#8fb7ff]"
              },
              {
                step: "03",
                title: "Start both, pick one",
                left: "First pass",
                right: "First pass",
                description:
                  "Send the same first prompt to Claude and Codex, compare the first pass, then continue from the thread you trust.",
                outcome: "Continue the better start",
                Icon: Split,
                color: "bg-[#9ee6b4]"
              },
              {
                step: "04",
                title: "Switch the next turn",
                left: "Next prompt",
                right: "Switch back",
                description:
                  "Send the next prompt to whichever agent fits the moment, then switch back without starting a new terminal conversation.",
                outcome: "One working thread",
                Icon: Repeat2,
                color: "bg-[#d9b7ff]"
              }
            ].map((item) => (
              <article
                key={item.title}
                className="group grid gap-5 bg-white p-5 shadow-[inset_0_0_0_1px_rgba(23,32,51,0.08)] transition hover:shadow-[inset_0_0_0_1px_rgba(23,32,51,0.18)]"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`${item.color} flex size-12 shrink-0 items-center justify-center text-[#172033]`}
                  >
                    <item.Icon className="size-5" aria-hidden="true" />
                  </div>
                  <div className="flex items-center gap-3 font-mono text-sm text-[#657188]">
                    <span>{item.step}</span>
                    <span>{item.left}</span>
                    <span aria-hidden="true">→</span>
                    <span>{item.right}</span>
                  </div>
                </div>
                <div>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-balance">
                    {item.title}
                  </h3>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-[#657188]">
                    {item.description}
                  </p>
                  <div className="mt-4 inline-flex bg-[#f5f7fb] px-3 py-2 font-mono text-sm text-[#172033]">
                    {item.outcome}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="faq"
        className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24"
      >
        <div className="border-t border-[#d8dee8] pt-12">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            FAQ
          </h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            {[
              {
                question: "What is Composer?",
                answer:
                  "Composer is a meta-harness that orchestrates harnesses like Codex, Claude, and others into one unified harness across shared context, sessions, and agents."
              },
              {
                question: "What does shared context mean?",
                answer:
                  "Composer keeps the active codebase, session history, tool results, diffs, and review notes together so Codex and Claude can work from the same picture."
              },
              {
                question: "Why compose Codex and Claude?",
                answer:
                  "Different agents are useful as independent passes on the same work. Use one to plan, another to implement, and either one to challenge the result without rebuilding context from pasted summaries."
              },
              {
                question: "How does handoff work?",
                answer:
                  "Handoffs happen through shared sessions and thread context instead of copy-pasting summaries between separate chats. The next agent can pick up the task with the relevant state already nearby."
              },
              {
                question: "What carries across threads?",
                answer:
                  "Composer keeps track of the workspace, previous turns, changed files, review comments, and agent outputs so follow-up work can stay grounded in the actual project."
              },
              {
                question: "What workflows does this unlock?",
                answer:
                  "Planning with Claude and reviewing with Codex, implementing with Codex and asking Claude to critique the design, or running parallel approaches while keeping the diffs, notes, and tool output comparable."
              }
            ].map((item) => (
              <div key={item.question}>
                <h3 className="text-base font-semibold text-[#172033]">
                  {item.question}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#657188]">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-[#1f1c1a] text-[#d6d0cb]">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-14 text-sm sm:grid-cols-2 sm:px-8 sm:py-16">
          <FooterColumn
            title="[Resources]"
            links={[
              { label: "FAQ", href: "#faq" },
              { label: "Blog", href: "/blog" },
              { label: "Changelog", href: "/changelog" }
            ]}
          />
          <FooterColumn
            title="[Connect]"
            links={[{ label: "Email", href: "mailto:atemjohn@stanford.edu" }]}
          />
        </div>
        <div className="mx-auto w-full max-w-6xl px-5 pb-8 text-sm text-[#8f8984] sm:px-8">
          © 2026 Composer
        </div>
      </footer>
    </main>
  );
}

function LandingHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-5 px-5 py-5 text-sm sm:px-8">
      <Link
        className="flex shrink-0 items-center gap-3"
        href="/"
        aria-label="Composer home"
      >
        <Image
          src="/composer-icon.png"
          alt=""
          width={32}
          height={32}
          className="size-8 rounded-md"
          priority
        />
        <span className="text-base font-semibold tracking-tight">Composer</span>
      </Link>

      <nav
        className="hidden flex-1 items-center justify-center gap-1 font-medium text-[#4c586d] md:flex"
        aria-label="Primary navigation"
      >
        <a
          className="rounded-full px-2.5 py-1 leading-none transition hover:bg-white hover:text-[#172033]"
          href="#faq"
        >
          FAQ
        </a>
        <HeaderMenu
          label="Resources"
          links={[
            { label: "Changelog", href: "/changelog" },
            { label: "Blog", href: "/blog" },
            { label: "Contact", href: "mailto:atemjohn@stanford.edu" }
          ]}
        />
      </nav>

      <div className="flex shrink-0 items-center gap-2 font-medium">
        <a
          className="inline-flex h-8 items-center justify-center rounded-full bg-[#172033] px-3.5 leading-none text-white transition hover:bg-[#2a354c]"
          href="/api/download"
          aria-label="Download Composer for your current platform"
        >
          Download
        </a>
      </div>
    </header>
  );
}

type HeaderMenuProps = {
  label: string;
  links: Array<{
    label: string;
    href: string;
  }>;
};

function HeaderMenu({ label, links }: HeaderMenuProps) {
  return (
    <div className="group relative">
      <button
        className="flex items-center gap-1 rounded-full px-2.5 py-1 leading-none transition hover:bg-white hover:text-[#172033]"
        type="button"
      >
        {label}
        <span className="text-xs text-[#8b95a5]" aria-hidden="true">
          ↓
        </span>
      </button>
      <div className="invisible absolute left-0 top-full z-20 min-w-44 pt-2 opacity-0 transition group-hover:visible group-hover:opacity-100">
        <div className="grid gap-1 rounded-xl border border-[#d8dee8] bg-white p-2 shadow-xl shadow-[#172033]/10">
          {links.map((link) =>
            link.href.startsWith("/") && !link.href.startsWith("/api/") ? (
              <Link
                key={`${label}-${link.href}`}
                className="rounded-lg px-2.5 py-1 leading-none text-[#4c586d] transition hover:bg-[#f5f7fb] hover:text-[#172033]"
                href={link.href}
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={`${label}-${link.href}`}
                className="rounded-lg px-2.5 py-1 leading-none text-[#4c586d] transition hover:bg-[#f5f7fb] hover:text-[#172033]"
                href={link.href}
              >
                {link.label}
              </a>
            )
          )}
        </div>
      </div>
    </div>
  );
}

type FooterColumnProps = {
  title: string;
  links: Array<{
    label: string;
    href: string;
  }>;
};

function FooterColumn({ title, links }: FooterColumnProps) {
  return (
    <div>
      <h2 className="font-mono text-sm tracking-wide text-[#8f8984]">
        {title}
      </h2>
      <nav className="mt-5 grid gap-3" aria-label={title}>
        {links.map((link) => (
          <a
            key={`${link.href}-${link.label}`}
            className="font-mono text-sm transition hover:text-white"
            href={link.href}
          >
            {link.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
