import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  sections: Array<{
    heading: string;
    body?: string;
    items: string[];
  }>;
};

const changelogEntries: ChangelogEntry[] = [];

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
