export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  readingTime: string;
  category: "product" | "workflow" | "engineering";
  author: string;
  featured?: boolean;
  content: Array<{
    heading: string;
    paragraphs: string[];
  }>;
};

export const blogPosts: BlogPost[] = [];

export const blogCategories: string[] = [];

export function getBlogPost(slug: string) {
  return blogPosts.find((post) => post.slug === slug);
}

export function getRelatedPosts(slug: string) {
  const post = getBlogPost(slug);

  if (!post) {
    return [];
  }

  return blogPosts
    .filter((candidate) => candidate.slug !== slug)
    .sort((a, b) => {
      if (a.category === post.category && b.category !== post.category) {
        return -1;
      }

      if (a.category !== post.category && b.category === post.category) {
        return 1;
      }

      return (
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
    })
    .slice(0, 3);
}

export function getSectionId(heading: string) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function formatPostDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}
