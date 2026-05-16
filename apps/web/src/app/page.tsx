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
          Compose Codex and Claude into one stronger coding workflow.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[#657188] sm:text-lg">
          Plan, implement, and review with multiple agents in a focused desktop
          workspace that keeps project context in one place.
        </p>

        <Image
          src="/composer-session.png"
          alt="Composer desktop thread session"
          width={3104}
          height={2024}
          className="mt-12 h-auto w-full"
          priority
          unoptimized
        />
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
                  "Composer is a desktop workspace for running coding agents, reviewing their changes, and keeping project context in one place."
              },
              {
                question: "Which agents does it support?",
                answer:
                  "Composer supports Codex, Claude, and a hybrid mode that plans with one agent and executes with another."
              },
              {
                question: "Does Composer work with local projects?",
                answer:
                  "Yes. Composer is built around local workspaces, so agents can work against files on your machine."
              },
              {
                question: "How do updates work?",
                answer:
                  "Desktop builds check for updates automatically and prompt you once an update is downloaded and ready to install."
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
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-14 text-sm sm:grid-cols-4 sm:px-8 sm:py-16">
          <FooterColumn
            title="[Company]"
            links={[
              { label: "Download", href: "/api/download" },
              { label: "Contact", href: "mailto:atemjohn@stanford.edu" }
            ]}
          />
          <FooterColumn
            title="[Resources]"
            links={[
              { label: "FAQ", href: "#faq" },
              { label: "Updates", href: "/api/download" }
            ]}
          />
          <FooterColumn
            title="[Legal]"
            links={[
              { label: "Privacy", href: "mailto:atemjohn@stanford.edu" },
              { label: "Terms", href: "mailto:atemjohn@stanford.edu" }
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
