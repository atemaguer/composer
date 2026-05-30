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
    <main className="relative z-10 min-h-screen text-ink">
      <header className="sticky top-0 z-50 bg-paper/60 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link className="flex items-center gap-2.5" href="/" aria-label="Composer home">
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
          <nav className="flex items-center gap-5 text-sm font-medium">
            <Link className="text-ink-soft transition-colors hover:text-ink" href="/blog">
              Blog
            </Link>
            <a
              className="inline-flex h-8 items-center justify-center rounded-full bg-ink px-4 leading-none text-paper transition-colors hover:bg-ink/85"
              href="/api/download"
              aria-label="Download Composer for your current platform"
            >
              Download
            </a>
          </nav>
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl px-5 pb-24 pt-16 sm:px-8 sm:pb-32 sm:pt-24">
        <div className="max-w-3xl">
          <p className="eyebrow flex items-center gap-2 text-accent">
            <span className="inline-block h-px w-6 bg-accent" aria-hidden="true" />
            Changelog
          </p>
          <h1 className="mt-4 text-[2rem] font-semibold tracking-[-0.02em] text-balance sm:text-[2.6rem]">
            Product updates for Composer.
          </h1>
        </div>

        <div className="mt-14 border-t border-line">
          {changelogEntries.map((entry) => (
            <article
              key={entry.version}
              className="grid gap-7 border-b border-line py-10 md:grid-cols-[180px_1fr]"
            >
              <div className="font-mono text-[13px] text-ink-soft">
                <div className="text-accent">v{entry.version}</div>
                <time dateTime={entry.date}>{formatDate(entry.date)}</time>
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.01em] text-balance sm:text-[1.75rem]">
                  {entry.title}
                </h2>
                <div className="mt-8 grid gap-8">
                  {entry.sections.map((section) => (
                    <section key={section.heading}>
                      <h3 className="text-[15px] font-semibold tracking-tight text-ink">
                        {section.heading}
                      </h3>
                      {section.body ? (
                        <p className="mt-3 max-w-2xl text-[14px] leading-6 text-ink-soft">
                          {section.body}
                        </p>
                      ) : null}
                      <ul className="mt-4 grid gap-3 text-[14px] leading-6 text-ink-soft">
                        {section.items.map((change) => (
                          <li key={change} className="flex gap-3">
                            <span
                              className="mt-2 size-1.5 shrink-0 rounded-full bg-accent"
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
