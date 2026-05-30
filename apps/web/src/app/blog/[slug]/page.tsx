import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  blogPosts,
  formatPostDate,
  getBlogPost,
  getRelatedPosts,
  getSectionId
} from "@/lib/blog";

type BlogPostPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return blogPosts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    return {
      title: "Post not found | Composer",
    };
  }

  return {
    title: `${post.title} | Composer`,
    description: post.description,
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    notFound();
  }

  const relatedPosts = getRelatedPosts(post.slug);

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
          <Link
            className="font-mono text-sm text-ink-soft transition-colors hover:text-ink"
            href="/blog"
          >
            Blog
          </Link>
        </div>
      </header>

      <article className="mx-auto grid w-full max-w-6xl gap-12 px-5 pb-20 pt-12 sm:px-8 sm:pb-28 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <div className="font-mono text-sm text-ink-soft">
            <Link className="transition hover:text-ink" href="/blog">
              Blog
            </Link>
            <span> / </span>
            <Link
              className="transition hover:text-ink"
              href={`/blog?category=${post.category}`}
            >
              {post.category}
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-2 gap-y-2 font-mono text-sm text-ink-soft">
            <time dateTime={post.publishedAt}>
              {formatPostDate(post.publishedAt)}
            </time>
            <span aria-hidden="true">·</span>
            <span>{post.category}</span>
          </div>

          <h1 className="mt-5 max-w-4xl text-[2.4rem] font-semibold tracking-[-0.02em] text-balance sm:text-[3.2rem]">
            {post.title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-ink-soft">
            {post.description}
          </p>
          <p className="mt-5 font-mono text-sm text-ink-soft">
            {post.readingTime}
          </p>

          <div className="mt-12 max-w-3xl border-t border-line pt-10">
            {post.content.map((section) => (
              <section
                key={section.heading}
                id={getSectionId(section.heading)}
                className="scroll-mt-10 pt-12 first:pt-0"
              >
                <h2 className="text-3xl font-semibold tracking-tight text-balance">
                  {section.heading}
                </h2>
                <div className="mt-6 grid gap-5 text-base leading-8 text-ink-soft">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-12 max-w-3xl border-t border-line pt-8 font-mono text-sm text-ink-soft">
            <p>
              Filed under:{" "}
              <Link className="text-ink" href={`/blog?category=${post.category}`}>
                {post.category}
              </Link>
            </p>
            <p className="mt-2">Author: {post.author}</p>
          </div>

          <section className="mt-16 max-w-3xl border-t border-line pt-10">
            <h2 className="text-2xl font-semibold tracking-tight">
              Related posts
            </h2>
            <div className="mt-6 grid gap-4">
              {relatedPosts.map((relatedPost) => (
                <Link
                  key={relatedPost.slug}
                  className="group grid gap-2 border-b border-line pb-5 transition hover:border-line-strong"
                  href={`/blog/${relatedPost.slug}`}
                >
                  <span className="font-mono text-sm text-ink-soft">
                    {formatPostDate(relatedPost.publishedAt)} ·{" "}
                    {relatedPost.category}
                  </span>
                  <span className="flex items-center justify-between gap-4 text-lg font-semibold tracking-tight">
                    {relatedPost.title}
                    <ArrowRight
                      className="size-4 shrink-0 transition group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              ))}
              <Link
                className="inline-flex items-center gap-2 font-mono text-sm text-ink"
                href="/blog"
              >
                View more posts <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-8 border-l border-line pl-6">
            <h2 className="font-mono text-sm text-ink-soft">
              Table of Contents
            </h2>
            <Link
              className="mt-4 inline-flex font-mono text-sm text-ink-soft transition hover:text-ink"
              href="#"
              aria-label="Back to top"
            >
              ↑
            </Link>
            <nav className="mt-5 grid gap-3 font-mono text-sm" aria-label="Table of contents">
              {post.content.map((section) => (
                <a
                  key={section.heading}
                  className="text-ink-soft transition hover:text-ink"
                  href={`#${getSectionId(section.heading)}`}
                >
                  {section.heading}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      </article>

      <div className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 font-mono text-sm text-ink-soft transition hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to blog
        </Link>
      </div>
    </main>
  );
}
