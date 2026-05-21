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
    slug: "usage-limits-codex-claude-code",
    title: "Usage limits make multi-agent handoff a product problem",
    description:
      "Developers are coping with Codex and Claude Code limits by subscribing to both. Composer makes that workaround practical by preserving the working context between agents.",
    publishedAt: "2026-05-21",
    readingTime: "6 min read",
    category: "workflow",
    author: "Composer",
    featured: true,
    content: [
      {
        heading: "The limit problem is workflow interruption",
        paragraphs: [
          "Usage limits are not just a billing annoyance. They interrupt the exact moment when an agent has accumulated enough context to be useful: midway through a refactor, after reading the codebase, or while reviewing a complicated diff.",
          "When Claude Code or Codex pauses, the developer usually still has work in flight. The branch exists, the terminal output exists, the partial reasoning exists, and the open questions are still real. The problem is that the next tool often cannot see that state without the user manually reconstructing it."
        ]
      },
      {
        heading: "The obvious workaround is using both",
        paragraphs: [
          "A practical workaround is to keep both Codex and Claude Code available. If Claude Code hits its limit, continue in Codex. If Codex is exhausted, move the next planning or review pass to Claude. Because the usage pools live behind different products, one limit does not necessarily stop all agent work.",
          "That is a reasonable strategy for serious users. It turns a hard stop into a failover event. The developer still pays for both subscriptions, but the day is less likely to stall because one provider has temporarily run out of capacity."
        ]
      },
      {
        heading: "The catch is context portability",
        paragraphs: [
          "The workaround falls apart when the handoff is just copy and paste. A second agent needs more than a paragraph explaining what happened. It needs the current branch, the relevant files, the diff, the commands that ran, the errors that failed, and the review notes that are still unresolved.",
          "Without that shared state, the user burns the next agent's usage budget rebuilding context. The failover technically works, but the productivity gain disappears into summaries, repeated file reads, and stale assumptions."
        ]
      },
      {
        heading: "Composer turns failover into a workflow",
        paragraphs: [
          "Composer is designed around this problem. It keeps Codex and Claude work organized around the same project, so switching agents does not mean starting a new disconnected conversation. The workspace, changed files, thread history, tool output, and review notes stay close to the task.",
          "That makes the dual-subscription workaround much more useful. A developer can use Claude for planning, Codex for implementation, Claude for critique, or Codex for a final review without having to rebuild the working state each time."
        ]
      },
      {
        heading: "Use the remaining bucket for the right pass",
        paragraphs: [
          "The best response to limits is not treating every agent as interchangeable. It is using the available agent for the pass it is best suited to at that moment. If Codex still has capacity, hand it the implementation or debugging pass. If Claude still has capacity, hand it the architecture review or adversarial critique.",
          "Composer makes that choice operational. Instead of asking which subscription is currently alive and then rebuilding the project context from scratch, the user can move the work to the available agent while keeping the surrounding evidence intact."
        ]
      },
      {
        heading: "Limits will remain, handoffs can improve",
        paragraphs: [
          "Usage limits are unlikely to disappear. The models are expensive, demand is uneven, and each provider will keep tuning capacity. Serious users will continue to maintain more than one agent subscription because downtime is more expensive than redundancy.",
          "The product opportunity is making that redundancy feel natural. Composer does not remove usage limits, but it reduces the cost of hitting one. When an agent stalls, the work can continue somewhere else without losing the thread."
        ]
      }
    ]
  },
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
