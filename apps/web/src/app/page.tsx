import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f5f7fb] text-[#172033]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <a className="flex items-center gap-3" href="/" aria-label="Composer home">
          <Image
            src="/composer-icon.png"
            alt=""
            width={32}
            height={32}
            className="size-8 rounded-md"
            priority
          />
          <span className="text-base font-semibold tracking-tight">Composer</span>
        </a>
        <a
          className="inline-flex h-10 items-center justify-center rounded-full bg-[#172033] px-5 text-sm font-medium text-white transition hover:bg-[#2a354c]"
          href="/api/download"
          aria-label="Download Composer for your current platform"
        >
          Download
        </a>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-5 pb-16 pt-16 text-center sm:px-8 sm:pb-24 sm:pt-24">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Give Codex and Claude the same working context.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[#657188] sm:text-lg">
          Compose teams of Codex and Claude around shared sessions, threads, and
          codebase context for easier handoff between agents.
        </p>

        <a
          className="mt-12 block w-full cursor-zoom-in"
          href="/composer-session.png"
          target="_blank"
          rel="noreferrer"
          aria-label="Open Composer screenshot full size"
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
                question: "What does shared context mean?",
                answer:
                  "Composer keeps the active codebase, session history, tool results, diffs, and review notes together so Codex and Claude can work from the same picture."
              },
              {
                question: "Why compose Codex and Claude?",
                answer:
                  "Different agents are useful at different parts of the work. Composer makes it easier to use one for planning, another for implementation, and either one for review."
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
              { label: "Updates", href: "/api/download" }
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
