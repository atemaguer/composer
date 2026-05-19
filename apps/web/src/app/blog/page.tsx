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
    <main className="min-h-screen bg-[#f5f7fb] text-[#172033]">
      <BlogHeader />

      <section className="mx-auto grid w-full max-w-6xl gap-12 px-5 pb-16 pt-12 sm:px-8 sm:pb-24 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-5 sm:grid-cols-2">
          {featuredPosts.map((post) => (
            <FeaturedPost key={post.slug} post={post} />
          ))}
        </div>

        <aside
          className="min-h-32 border-t border-[#d8dee8] pt-7 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"
          aria-label="Newsletter"
        />
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8 sm:pb-28">
        <div className="flex flex-col gap-6 border-t border-[#d8dee8] pt-10 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">
            Blog
          </h1>
          <nav
            className="flex flex-wrap gap-2 font-mono text-sm"
            aria-label="Blog categories"
          >
            {blogCategories.map((category) => (
              <Link
                key={category}
                className="rounded-full border border-[#d8dee8] px-2.5 py-0.5 leading-none text-[#657188] transition hover:border-[#aab4c3] hover:text-[#172033]"
                href={category === "all" ? "/blog" : `/blog?category=${category}`}
              >
                {category}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-10 border-t border-[#d8dee8]">
          {latestPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group grid gap-4 border-b border-[#d8dee8] py-7 transition hover:border-[#aab4c3] sm:grid-cols-[180px_1fr_auto]"
            >
              <div className="font-mono text-sm text-[#657188]">
                <time dateTime={post.publishedAt}>
                  {formatPostDate(post.publishedAt)}
                </time>
                <div className="mt-1">{post.category}</div>
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-balance">
                  {post.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#657188]">
                  {post.description}
                </p>
                <p className="mt-3 font-mono text-sm text-[#657188]">
                  {post.author} · {post.readingTime}
                </p>
              </div>
              <span className="hidden items-center font-mono text-sm text-[#172033] sm:flex">
                Read
                <ArrowRight
                  className="ml-2 size-4 transition group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </span>
            </Link>
          ))}
        </div>

        <div
          className="mt-16 grid min-h-32 gap-12 border-t border-[#d8dee8] pt-12 lg:grid-cols-[1fr_1fr]"
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
      className="group border-t border-[#d8dee8] pt-7 transition hover:border-[#aab4c3]"
    >
      <div className="font-mono text-sm text-[#657188]">
        <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
        <span> · {post.category}</span>
      </div>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-balance">
        {post.title}
      </h2>
      <p className="mt-3 text-sm leading-6 text-[#657188]">
        {post.description}
      </p>
      <p className="mt-5 font-mono text-sm text-[#657188]">
        {post.author} · {post.readingTime}
      </p>
    </Link>
  );
}

function BlogHeader() {
  return (
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
        <Link className="text-[#657188] transition hover:text-[#172033]" href="/">
          Home
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
  );
}

function BlogFooter() {
  return (
    <footer className="bg-[#1f1c1a] text-[#d6d0cb]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-14 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-16">
        <Link className="font-semibold text-white" href="/">
          Composer
        </Link>
        <nav className="flex flex-wrap gap-5 font-mono" aria-label="Footer">
          <Link className="transition hover:text-white" href="/changelog">
            Changelog
          </Link>
          <a className="transition hover:text-white" href="/api/download">
            Download
          </a>
          <a className="transition hover:text-white" href="mailto:atemjohn@stanford.edu">
            Email
          </a>
        </nav>
      </div>
    </footer>
  );
}
