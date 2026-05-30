import Image from "next/image";
import Link from "next/link";

import {
  HeroMock,
  ParallelMock,
  WorkflowMock,
  type MiniStep,
} from "@/components/composer-mock";
import { MobileNav } from "@/components/mobile-nav";
import { siteConfig } from "@/lib/site";

const NAV_LINKS = [
  { label: "FAQ", href: "#faq" },
  { label: "Docs", href: "/docs" },
  { label: "Changelog", href: "/changelog" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "mailto:atemjohn@stanford.edu" },
];

const WORKFLOWS: Array<{
  step: string;
  title: string;
  description: string;
  outcome: string;
  steps?: MiniStep[];
  parallel?: boolean;
}> = [
  {
    step: "01",
    title: "Plan, then review",
    description:
      "Have one agent sketch the approach and the other challenge it before code changes start.",
    outcome: "Second pass before code",
    steps: [
      { kind: "msg", provider: "claude", text: "Plan: extract token refresh into a guarded helper." },
      { kind: "handoff", to: "codex" },
      { kind: "msg", provider: "codex", text: "Reviewed — flagged a missing token-expiry case." },
    ],
  },
  {
    step: "02",
    title: "Plan, then execute",
    description:
      "Hand a plan from Claude to Codex, or from Codex to Claude, and let the next agent run with it.",
    outcome: "Another agent runs with it",
    steps: [
      { kind: "msg", provider: "claude", text: "Plan ready: 3 steps across auth + tests." },
      { kind: "handoff", to: "codex" },
      { kind: "tool", label: "Edited 3 files" },
      { kind: "diff", file: "auth.ts", add: 24, del: 6 },
    ],
  },
  {
    step: "03",
    title: "Start both, pick one",
    description:
      "Send the same first prompt to Claude and Codex, compare the first pass, then continue from the thread you trust.",
    outcome: "Continue the better start",
    parallel: true,
  },
  {
    step: "04",
    title: "Switch the next turn",
    description:
      "Send the next prompt to whichever agent fits the moment, then switch back without starting a new terminal conversation.",
    outcome: "One working thread",
    steps: [
      { kind: "msg", provider: "codex", text: "Shipped the migration and ran it locally." },
      { kind: "handoff", to: "claude" },
      { kind: "msg", provider: "claude", text: "Next: add a rollback test for the down path." },
    ],
  },
];

const FAQ_ITEMS = [
  {
    question: "What is Composer?",
    answer:
      "Composer is a meta-harness that orchestrates harnesses like Codex, Claude, and others into one unified harness across shared context, sessions, and agents.",
  },
  {
    question: "What does shared context mean?",
    answer:
      "Composer keeps the active codebase, session history, tool results, diffs, and review notes together so Codex and Claude can work from the same picture.",
  },
  {
    question: "Why compose Codex and Claude?",
    answer:
      "Different agents are useful as independent passes on the same work. Use one to plan, another to implement, and either one to challenge the result without rebuilding context from pasted summaries.",
  },
  {
    question: "How does handoff work?",
    answer:
      "Handoffs happen through shared sessions and thread context instead of copy-pasting summaries between separate chats. The next agent can pick up the task with the relevant state already nearby.",
  },
  {
    question: "What carries across threads?",
    answer:
      "Composer keeps track of the workspace, previous turns, changed files, review comments, and agent outputs so follow-up work can stay grounded in the actual project.",
  },
  {
    question: "What workflows does this unlock?",
    answer:
      "Planning with Claude and reviewing with Codex, implementing with Codex and asking Claude to critique the design, or running parallel approaches while keeping the diffs, notes, and tool output comparable.",
  },
];

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: siteConfig.name,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Windows, Linux",
      description: siteConfig.description,
      url: siteConfig.url,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ],
};

export default function Home() {
  return (
    <main className="relative z-10 min-h-screen text-ink">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <LandingHeader />

      <section className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-5 pb-20 pt-16 text-center sm:px-8 sm:pb-28 sm:pt-20">
        <h1 className="load-up load-1 max-w-3xl text-[2rem] font-semibold leading-[1.05] tracking-[-0.02em] text-balance text-ink sm:text-[2.7rem]">
          Seamless Claude and Codex handoff.
        </h1>
        <p className="load-up load-2 mt-5 max-w-xl text-[14px] leading-6 text-ink-soft sm:text-[15px]">
          Start in Claude, continue in Codex, then switch back on the next
          prompt. Composer carries the context so you do not have to re-explain
          the work in another terminal.
        </p>
        <div className="load-up load-3 mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <a
            className="inline-flex h-11 items-center justify-center bg-ink px-6 text-[13.5px] font-semibold leading-none text-paper transition-colors duration-200 hover:bg-accent-deep"
            href="/api/download"
            aria-label="Download Composer for your current platform"
          >
            Download Composer
          </a>
          <Link
            className="inline-flex h-11 items-center justify-center border border-line-strong bg-paper/70 px-6 text-[13.5px] font-semibold leading-none text-ink transition-colors duration-200 hover:border-ink hover:bg-paper-2"
            href="/docs"
          >
            Read the docs
          </Link>
        </div>

        <div className="load-up load-5 relative mt-14 w-full">
          <div className="blueprint-grid pointer-events-none absolute -inset-x-6 -top-12 bottom-10 sm:-inset-x-14" />
          <div className="pointer-events-none absolute inset-x-16 -top-10 h-52 bg-[radial-gradient(58%_120%_at_50%_0%,rgba(207,91,52,0.22),transparent_70%)]" />
          <div className="relative [filter:drop-shadow(0_48px_70px_rgba(24,21,17,0.22))]">
            <HeroMock />
          </div>
        </div>
      </section>

      <section
        id="use-cases"
        className="relative border-y border-line bg-paper-2 px-5 py-20 text-ink sm:px-8 sm:py-28"
      >
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end">
            <div className="reveal">
              <p className="eyebrow flex items-center gap-2 text-accent">
                <span className="inline-block h-px w-6 bg-accent" aria-hidden="true" />
                Workflows
              </p>
              <h2 className="mt-4 max-w-2xl text-2xl font-semibold leading-tight tracking-[-0.01em] text-balance sm:text-[2rem]">
                The handoffs people already do by hand.
              </h2>
            </div>
            <p className="reveal max-w-md text-[14px] leading-6 text-ink-soft sm:text-[15px] lg:justify-self-end">
              Composer turns the copy-paste relay between Claude and Codex
              terminals into one continuous agent thread.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {WORKFLOWS.map((item) => (
              <article
                key={item.title}
                className="reveal group flex flex-col gap-5 rounded-2xl border border-line bg-paper p-5 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_18px_40px_-30px_rgba(24,21,17,0.4)] transition duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_28px_55px_-28px_rgba(24,21,17,0.45)]"
              >
                <div className="flex items-center gap-3">
                  <span className="eyebrow text-accent">{item.step}</span>
                  <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
                  <span className="text-[15px] font-semibold tracking-tight text-ink">
                    {item.title}
                  </span>
                </div>
                {item.parallel ? (
                  <ParallelMock />
                ) : (
                  <WorkflowMock steps={item.steps ?? []} />
                )}
                <div className="mt-auto">
                  <p className="max-w-xl text-[14px] leading-6 text-ink-soft">
                    {item.description}
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-line-strong bg-paper-2 px-3 py-1.5 font-mono text-[12px] text-ink-soft">
                    <span className="size-1 rounded-full bg-accent" aria-hidden="true" />
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
        className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28"
      >
        <h2 className="reveal flex items-center gap-3 text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-[2rem]">
          <span className="inline-block h-5 w-1 rounded-full bg-accent" aria-hidden="true" />
          FAQ
        </h2>
        <div className="mt-10 grid gap-x-14 gap-y-2 sm:grid-cols-2">
          {FAQ_ITEMS.map((item, index) => (
            <div
              key={item.question}
              className="reveal flex gap-4 border-t border-line py-5"
            >
              <span className="eyebrow mt-1 shrink-0 text-accent">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-[15px] font-semibold text-ink">
                  {item.question}
                </h3>
                <p className="mt-2 text-[14px] leading-6 text-ink-soft">
                  {item.answer}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-line bg-paper-dark text-[#cdc6bb]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-5 py-16 text-sm sm:flex-row sm:items-start sm:justify-between sm:px-8">
          <div className="flex items-center gap-2.5">
            <Image
              src="/composer-icon.png"
              alt=""
              width={28}
              height={28}
              className="size-7 rounded-md"
            />
            <span className="text-[15px] font-semibold tracking-tight text-[#f4efe6]">
              Composer
            </span>
          </div>
          <div className="grid gap-12 sm:grid-cols-2 sm:gap-16">
            <FooterColumn
              title="[Resources]"
              links={[
                { label: "FAQ", href: "#faq" },
                { label: "Docs", href: "/docs" },
                { label: "Blog", href: "/blog" },
                { label: "Changelog", href: "/changelog" }
              ]}
            />
            <FooterColumn
              title="[Connect]"
              links={[{ label: "Email", href: "mailto:atemjohn@stanford.edu" }]}
            />
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl border-t border-white/10 px-5 py-6 font-mono text-[12px] text-[#857d72] sm:px-8">
          © 2026 Composer
        </div>
      </footer>
    </main>
  );
}

function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 bg-paper/60 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-5 px-5 py-3.5 text-sm sm:px-8">
        <Link
          className="flex shrink-0 items-center gap-2.5"
          href="/"
          aria-label="Composer home"
        >
          <Image
            src="/composer-icon.png"
            alt=""
            width={32}
            height={32}
            className="size-7 rounded-md ring-1 ring-line-strong"
            priority
          />
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            Composer
          </span>
        </Link>

        <nav
          className="hidden flex-1 items-center justify-center gap-1 font-medium text-ink-soft md:flex"
          aria-label="Primary navigation"
        >
          <a
            className="rounded-full px-3 py-1.5 leading-none transition-colors hover:bg-ink/5 hover:text-ink"
            href="#faq"
          >
            FAQ
          </a>
          <Link
            className="rounded-full px-3 py-1.5 leading-none transition-colors hover:bg-ink/5 hover:text-ink"
            href="/docs"
          >
            Docs
          </Link>
          <HeaderMenu
            label="Resources"
            links={[
              { label: "Docs", href: "/docs" },
              { label: "Changelog", href: "/changelog" },
              { label: "Blog", href: "/blog" },
              { label: "Contact", href: "mailto:atemjohn@stanford.edu" }
            ]}
          />
        </nav>

        <div className="flex shrink-0 items-center gap-2 font-medium">
          <MobileNav links={NAV_LINKS} />
          <a
            className="inline-flex h-8 items-center justify-center rounded-full bg-ink px-4 leading-none text-paper transition-colors hover:bg-accent-deep"
            href="/api/download"
            aria-label="Download Composer for your current platform"
          >
            Download
          </a>
        </div>
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
        className="flex items-center gap-1 rounded-full px-3 py-1.5 leading-none transition-colors hover:bg-ink/5 hover:text-ink"
        type="button"
      >
        {label}
        <span className="text-xs text-ink-faint" aria-hidden="true">
          ↓
        </span>
      </button>
      <div className="invisible absolute left-0 top-full z-20 min-w-44 pt-2 opacity-0 transition group-hover:visible group-hover:opacity-100">
        <div className="grid gap-1 rounded-xl border border-line-strong bg-paper p-2 shadow-[0_20px_45px_-20px_rgba(24,21,17,0.35)]">
          {links.map((link) =>
            link.href.startsWith("/") && !link.href.startsWith("/api/") ? (
              <Link
                key={`${label}-${link.href}`}
                className="rounded-lg px-2.5 py-1.5 leading-none text-ink-soft transition-colors hover:bg-paper-2 hover:text-accent-deep"
                href={link.href}
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={`${label}-${link.href}`}
                className="rounded-lg px-2.5 py-1.5 leading-none text-ink-soft transition-colors hover:bg-paper-2 hover:text-accent-deep"
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
      <h2 className="font-mono text-[12px] uppercase tracking-[0.16em] text-accent/80">
        {title}
      </h2>
      <nav className="mt-5 grid gap-3" aria-label={title}>
        {links.map((link) => (
          <a
            key={`${link.href}-${link.label}`}
            className="w-fit font-mono text-[13px] text-[#cdc6bb] transition-colors hover:text-[#f4efe6]"
            href={link.href}
          >
            {link.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
