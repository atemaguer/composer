import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { blogCategories, blogPosts, formatPostDate } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog | Composer",
  description:
    "Notes on agent-native development, shared context, and better handoffs between coding agents.",
};

export default function BlogPage() {
  const featuredPosts = blogPosts.filter((post) => post.featured);
  const latestPosts = blogPosts;

  return (
    <main className="relative z-10 min-h-screen text-ink">
      <BlogHeader />

      <section className="mx-auto grid w-full max-w-6xl gap-12 px-5 pb-16 pt-12 sm:px-8 sm:pb-24 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-5 sm:grid-cols-2">
          {featuredPosts.map((post) => (
            <FeaturedPost key={post.slug} post={post} />
          ))}
        </div>

        <aside
          className="min-h-32 border-t border-line pt-7 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"
          aria-label="Newsletter"
        />
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-24 sm:px-8 sm:pb-32">
        <div className="flex flex-col gap-6 border-t border-line pt-10 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-[2.6rem] font-semibold tracking-[-0.02em] sm:text-[3.4rem]">
            Blog
          </h1>
          <nav
            className="flex flex-wrap gap-2 font-mono text-sm"
            aria-label="Blog categories"
          >
            {blogCategories.map((category) => (
              <Link
                key={category}
                className="rounded-full border border-line px-2.5 py-0.5 leading-none text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                href={category === "all" ? "/blog" : `/blog?category=${category}`}
              >
                {category}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-10 border-t border-line">
          {latestPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group grid gap-4 border-b border-line py-7 transition-colors hover:border-line-strong sm:grid-cols-[180px_1fr_auto]"
            >
              <div className="font-mono text-[13px] text-ink-soft">
                <time dateTime={post.publishedAt}>
                  {formatPostDate(post.publishedAt)}
                </time>
                <div className="mt-1 text-accent">{post.category}</div>
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.01em] text-balance text-ink">
                  {post.title}
                </h2>
                <p className="mt-2 max-w-2xl text-[14px] leading-6 text-ink-soft">
                  {post.description}
                </p>
                <p className="mt-3 font-mono text-[13px] text-ink-faint">
                  {post.author} · {post.readingTime}
                </p>
              </div>
              <span className="hidden items-center font-mono text-[13px] text-accent sm:flex">
                Read
                <ArrowRight
                  className="ml-2 size-4 transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </span>
            </Link>
          ))}
        </div>

        <div
          className="mt-16 grid min-h-32 gap-12 border-t border-line pt-12 lg:grid-cols-[1fr_1fr]"
          aria-label="Supporting blog content"
        />
      </section>

      <BlogFooter />
    </main>
  );
}

type PostCardProps = {
  post: (typeof blogPosts)[number];
};

function FeaturedPost({ post }: PostCardProps) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group border-t border-line pt-7 transition-colors hover:border-line-strong"
    >
      <div className="font-mono text-[13px] text-ink-soft">
        <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
        <span> · {post.category}</span>
      </div>
      <h2 className="mt-4 text-2xl font-semibold tracking-[-0.01em] text-balance text-ink sm:text-[1.7rem]">
        {post.title}
      </h2>
      <p className="mt-3 text-[14px] leading-6 text-ink-soft">
        {post.description}
      </p>
      <p className="mt-5 font-mono text-[13px] text-ink-faint">
        {post.author} · {post.readingTime}
      </p>
    </Link>
  );
}

function BlogHeader() {
  return (
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
          <Link className="text-ink-soft transition-colors hover:text-ink" href="/">
            Home
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
  );
}

function BlogFooter() {
  return (
    <footer className="relative z-10 border-t border-line bg-paper-dark text-[#cdc6bb]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-14 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-16">
        <Link className="font-semibold text-[#f4efe6]" href="/">
          Composer
        </Link>
        <nav className="flex flex-wrap gap-5 font-mono" aria-label="Footer">
          <Link className="transition-colors hover:text-[#f4efe6]" href="/changelog">
            Changelog
          </Link>
          <a className="transition-colors hover:text-[#f4efe6]" href="/api/download">
            Download
          </a>
          <a
            className="transition-colors hover:text-[#f4efe6]"
            href="https://discord.com/invite/mqq6NwczPw"
            target="_blank"
            rel="noopener noreferrer"
          >
            Discord
          </a>
        </nav>
      </div>
    </footer>
  );
}
