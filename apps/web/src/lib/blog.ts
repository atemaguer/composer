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

export const blogPosts = [
  {
    slug: "shared-context-for-agent-work",
    title: "Shared context is the interface for agent work",
    description:
      "Why coding agents need a durable workspace that keeps sessions, files, diffs, and review notes together.",
    publishedAt: "2026-05-19",
    readingTime: "4 min read",
    category: "product",
    author: "Composer Team",
    featured: true,
    content: [
      {
        heading: "Agents need more than a prompt",
        paragraphs: [
          "Most agent workflows still depend on a long prompt and a fragile mental model of what happened before. That works for short tasks, but it breaks down when the work spans planning, implementation, review, and follow-up.",
          "Composer treats the workspace as the shared interface. The active project, thread history, tool output, changed files, and review context stay close enough that another agent can continue without a manual handoff."
        ]
      },
      {
        heading: "Handoffs should preserve state",
        paragraphs: [
          "A useful handoff is not a summary pasted into a new chat. It is a preserved working state: what changed, why it changed, which commands ran, and where the open questions are.",
          "That shared state lets teams use different agents for the parts of work they are best suited to while keeping the project itself as the source of truth."
        ]
      },
      {
        heading: "The workspace becomes the memory",
        paragraphs: [
          "Long-running software work is full of small details that matter later. Composer keeps those details attached to the session instead of scattering them across disconnected tools.",
          "The result is a tighter feedback loop for agent-native development: less context rebuilding, fewer stale assumptions, and clearer review."
        ]
      }
    ]
  },
  {
    slug: "designing-for-agent-handoffs",
    title: "Designing better handoffs between Codex and Claude",
    description:
      "A practical look at what needs to travel with a task when different agents collaborate on the same codebase.",
    publishedAt: "2026-05-12",
    readingTime: "3 min read",
    category: "workflow",
    author: "Composer Team",
    featured: true,
    content: [
      {
        heading: "The handoff is part of the product",
        paragraphs: [
          "Agent collaboration gets messy when every transition starts from scratch. The receiving agent needs the latest code, the relevant prior reasoning, and a clear picture of the constraints already discovered.",
          "Composer is built around that transition. Sessions and threads make handoff a first-class workflow instead of a side effect of copying text between tools."
        ]
      },
      {
        heading: "Keep evidence attached",
        paragraphs: [
          "Commands, diffs, test output, and review notes are evidence. They should stay connected to the task so decisions can be checked rather than reconstructed.",
          "When the evidence is nearby, the next agent can make a grounded move quickly: continue, verify, ask for clarification, or challenge an assumption."
        ]
      }
    ]
  },
  {
    slug: "review-loops-for-agent-native-development",
    title: "Review loops for agent-native development",
    description:
      "How tighter review cycles help agent work stay grounded in the actual codebase instead of drifting into speculation.",
    publishedAt: "2026-05-05",
    readingTime: "5 min read",
    category: "engineering",
    author: "Composer Team",
    content: [
      {
        heading: "Review is where context pays off",
        paragraphs: [
          "The most useful reviews are specific. They point at files, behavior, tests, and tradeoffs. That level of specificity depends on the reviewer having enough context to understand the work in front of them.",
          "Composer keeps review close to the session so feedback can refer to the actual changes instead of a secondhand description of them."
        ]
      },
      {
        heading: "Short loops beat big reveals",
        paragraphs: [
          "Agent work benefits from shorter loops: inspect, change, verify, review, and adjust. Waiting until the end makes it harder to separate a good decision from a lucky result.",
          "A shared workspace makes those loops easier to run because each step leaves behind useful state for the next one."
        ]
      },
      {
        heading: "Grounded agents are more useful agents",
        paragraphs: [
          "The point is not to make agents autonomous at all costs. The point is to make them easier to steer, review, and trust inside real software projects.",
          "Grounding every step in the codebase creates a clearer collaboration model between people and the agents they choose to bring into the work."
        ]
      }
    ]
  }
] satisfies BlogPost[];

export const blogCategories = ["all", "product", "workflow", "engineering"];

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
