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

export const blogPosts: BlogPost[] = [
  {
    slug: "why-compose-codex-and-claude",
    title: "Why compose Codex and Claude?",
    description:
      "The value is not model switching. It is keeping independent planning, implementation, and review passes grounded in the same project state.",
    publishedAt: "2026-05-19",
    readingTime: "5 min read",
    category: "workflow",
    author: "Composer",
    featured: true,
    content: [
      {
        heading: "Two agents create useful disagreement",
        paragraphs: [
          "Developers are already using Codex and Claude together because the second agent is most valuable when it sees the same work and reaches a different conclusion. One agent can propose the implementation path while the other looks for missing constraints, brittle assumptions, security gaps, or test cases the first pass skipped.",
          "That workflow breaks down when every handoff starts with a stale pasted summary. The reviewer does not need a polished narrative as much as it needs the current codebase, the actual diff, the terminal output, and the decisions that led there."
        ]
      },
      {
        heading: "Planning, implementation, review",
        paragraphs: [
          "A common pattern is to use Claude for broad planning and architecture, then hand the plan to Codex for implementation or code review. Another pattern reverses the order: Codex changes the code, then Claude checks the design, readability, and edge cases. The useful part is not which brand owns which step. The useful part is that each step can be done by a fresh agent without losing the surrounding context.",
          "Composer is built around that loop. It keeps sessions, threads, changed files, tool results, and review notes close together so the next agent is not starting from a thin prompt. The plan, the implementation, and the critique stay attached to the same working project."
        ]
      },
      {
        heading: "Adversarial review",
        paragraphs: [
          "The strongest multi-agent workflows are not polite relay races. They are adversarial in the engineering sense: ask another model to challenge the plan before it becomes code, or challenge the code before it becomes a pull request.",
          "That second pass can ask sharper questions. What happens when auth expires midway through the flow? Which migration step is irreversible? Did the first agent optimize for a happy path test while missing production data shape? Shared context makes those questions cheaper because the reviewer can inspect the same artifacts instead of relying on a paraphrase."
        ]
      },
      {
        heading: "Parallel exploration",
        paragraphs: [
          "Users also run Codex and Claude in parallel when there are multiple plausible approaches. One agent can explore a small patch, another can investigate a broader refactor, and a human can compare the resulting diffs, notes, and failures.",
          "That is hard to manage when each agent lives in a separate transcript with separate memory. Composer makes the parallel work visible as related sessions around one codebase, so the output can be compared instead of reconstructed."
        ]
      },
      {
        heading: "The handoff is the product surface",
        paragraphs: [
          "The important interface is not a prompt box for choosing a model. It is the handoff surface: what context carries forward, which files changed, what the last agent tried, which commands passed, which review notes remain unresolved, and what a second agent should inspect next.",
          "Composing Codex and Claude becomes useful when those handoffs are first-class. The user gets independent agent work without paying the usual tax of copying summaries, recreating state, and wondering whether the next agent is reviewing the real project or a story about it."
        ]
      }
    ]
  }
];

export const blogCategories: string[] = ["all", "workflow"];

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
