import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

const changelogEntries = [
  {
    version: "0.3.0",
    date: "2026-05-19",
    title: "Shared context, cleaner handoffs",
    sections: [
      {
        heading: "Shared session context",
        body:
          "Composer now keeps active codebase state, session history, tool output, diffs, and review notes closer together so Codex and Claude can work from the same picture.",
        items: [
          "Agent handoffs preserve the relevant workspace state instead of relying on manual summaries.",
          "Changed files and review notes stay attached to the active thread for easier follow-up work.",
          "Thread context is organized around the project so returning to a task requires less reconstruction."
        ]
      },
      {
        heading: "Review workflow",
        items: [
          "Review notes are easier to keep grounded in the file changes that produced them.",
          "Follow-up sessions can reference prior diffs and agent outputs with less copy-pasting.",
          "Composer keeps implementation and review context near the conversation that created it."
        ]
      }
    ]
  },
  {
    version: "0.2.0",
    date: "2026-05-12",
    title: "Agent workspace foundations",
    sections: [
      {
        heading: "Workspace navigation",
        body:
          "This release focused on making Composer feel like a durable desktop workspace for agent-driven software work.",
        items: [
          "Sessions are grouped around the current project and workspace.",
          "Thread state is preserved so work can continue after switching between active tasks.",
          "The app shell is tuned for scanning active sessions, files, and agent activity."
        ]
      },
      {
        heading: "Improvements",
        items: [
          "Improved the handoff flow between planning, implementation, and review sessions.",
          "Tightened the desktop layout for repeated agent steering workflows.",
          "Added clearer workspace state around active threads."
        ]
      }
    ]
  },
  {
    version: "0.1.0",
    date: "2026-05-05",
    title: "Composer preview",
    sections: [
      {
        heading: "Initial preview",
        body:
          "The first Composer preview introduced the core model: a focused desktop workspace for steering coding agents through real project work.",
        items: [
          "Codex and Claude sessions can live around the same project context.",
          "The workspace keeps conversation, file, and review state in one place.",
          "Composer establishes a foundation for agent-native handoffs and review loops."
        ]
      }
    ]
  }
];

export const metadata: Metadata = {
  title: "Changelog | Composer",
  description:
    "Product updates, release notes, and changes for Composer.",
};

export default function ChangelogPage() {
  return (
    <main className="min-h-screen bg-[#f5f7fb] text-[#172033]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link className="flex items-center gap-3" href="/" aria-label="Composer home">
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
        <nav className="flex items-center gap-5 text-sm font-medium">
          <Link className="text-[#657188] transition hover:text-[#172033]" href="/blog">
            Blog
          </Link>
          <a
            className="inline-flex h-8 items-center justify-center rounded-full bg-[#172033] px-3.5 leading-none text-white transition hover:bg-[#2a354c]"
            href="/api/download"
            aria-label="Download Composer for your current platform"
          >
            Download
          </a>
        </nav>
      </header>

      <section className="mx-auto w-full max-w-6xl px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24">
        <div className="max-w-3xl">
          <p className="font-mono text-sm text-[#657188]">Changelog</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Product updates for Composer.
          </h1>
          <p className="mt-5 text-base leading-7 text-[#657188] sm:text-lg">
            Release notes and notable changes as Composer evolves into a
            focused workspace for agent-native development.
          </p>
        </div>

        <div className="mt-14 border-t border-[#d8dee8]">
          {changelogEntries.map((entry) => (
            <article
              key={entry.version}
              className="grid gap-7 border-b border-[#d8dee8] py-10 md:grid-cols-[180px_1fr]"
            >
              <div className="font-mono text-sm text-[#657188]">
                <div>v{entry.version}</div>
                <time dateTime={entry.date}>{formatDate(entry.date)}</time>
              </div>
              <div>
                <h2 className="text-3xl font-semibold tracking-tight text-balance">
                  {entry.title}
                </h2>
                <div className="mt-8 grid gap-8">
                  {entry.sections.map((section) => (
                    <section key={section.heading}>
                      <h3 className="text-lg font-semibold tracking-tight">
                        {section.heading}
                      </h3>
                      {section.body ? (
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#465267]">
                          {section.body}
                        </p>
                      ) : null}
                      <ul className="mt-4 grid gap-3 text-sm leading-6 text-[#465267]">
                        {section.items.map((change) => (
                          <li key={change} className="flex gap-3">
                            <span
                              className="mt-2 size-1.5 shrink-0 rounded-full bg-[#172033]"
                              aria-hidden="true"
                            />
                            <span>{change}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}
