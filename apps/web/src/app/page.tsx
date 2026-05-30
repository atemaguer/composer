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
    <main className="min-h-screen bg-[#f5f7fb] text-[#172033]">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <LandingHeader />

      <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-5 pb-16 pt-14 text-center sm:px-8 sm:pb-24 sm:pt-20">
        <h1 className="max-w-3xl text-[1.95rem] font-semibold leading-[1.08] tracking-tight text-balance sm:text-[2.6rem]">
          Seamless Claude and Codex handoff.
        </h1>
        <p className="mt-4 max-w-xl text-[13.5px] leading-6 text-[#657188] sm:text-[15px]">
          Start in Claude, continue in Codex, then switch back on the next
          prompt. Composer carries the context so you do not have to re-explain
          the work in another terminal.
        </p>
        <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row">
          <a
            className="inline-flex h-10 items-center justify-center bg-[#172033] px-5 text-sm font-semibold leading-none text-white transition hover:bg-[#2a354c]"
            href="/api/download"
            aria-label="Download Composer for your current platform"
          >
            Download Composer
          </a>
          <Link
            className="inline-flex h-10 items-center justify-center border border-[#c9d2df] bg-white px-5 text-sm font-semibold leading-none text-[#172033] transition hover:border-[#9aa8bb] hover:bg-[#edf2f8]"
            href="/docs"
          >
            Read the docs
          </Link>
        </div>

        <div className="mt-10 w-full">
          <HeroMock />
        </div>
      </section>

      <section
        id="use-cases"
        className="bg-[#eaf0f8] px-5 py-16 text-[#172033] sm:px-8 sm:py-24"
      >
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end">
            <div>
              <p className="font-mono text-[13px] text-[#657188]">Workflows</p>
              <h2 className="mt-4 max-w-2xl text-2xl font-semibold leading-tight tracking-tight text-balance sm:text-[2rem]">
                The handoffs people already do by hand.
              </h2>
            </div>
            <p className="max-w-md text-[13.5px] leading-6 text-[#657188] sm:text-[15px] lg:justify-self-end">
              Composer turns the copy-paste relay between Claude and Codex
              terminals into one continuous agent thread.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {WORKFLOWS.map((item) => (
              <article
                key={item.title}
                className="group flex flex-col gap-5 bg-white p-5 shadow-[inset_0_0_0_1px_rgba(23,32,51,0.08)] transition hover:shadow-[inset_0_0_0_1px_rgba(23,32,51,0.18)]"
              >
                <div className="flex items-center gap-3 font-mono text-sm text-[#657188]">
                  <span>{item.step}</span>
                  <span aria-hidden="true">/</span>
                  <span className="text-[#172033]">{item.title}</span>
                </div>
                {item.parallel ? (
                  <ParallelMock />
                ) : (
                  <WorkflowMock steps={item.steps ?? []} />
                )}
                <div className="mt-auto">
                  <p className="max-w-xl text-sm leading-6 text-[#657188]">
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
            {FAQ_ITEMS.map((item) => (
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
        <Link
          className="rounded-full px-2.5 py-1 leading-none transition hover:bg-white hover:text-[#172033]"
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
