import type {
  ConversationItem,
  SessionContent,
  SessionProvider
} from "@composer/client";

/**
 * Builds a deterministic, provider-agnostic handoff summary from the visible
 * Composer transcript. Used as the fallback when a provider's model does not
 * return a readable handoff summary, so the next provider always inherits the
 * recent requests, output, and tool/file activity instead of an empty context.
 */
export function buildDeterministicHandoffSummary(options: {
  provider: SessionProvider;
  providerLabel: string;
  session: SessionContent;
  reason: string;
}): string {
  const { provider, providerLabel, session, reason } = options;

  const userMessages = latestItems(
    session.items,
    (item): item is Extract<ConversationItem, { type: "user_message" }> =>
      item.type === "user_message",
    5
  ).map((item) => `- ${truncate(item.body, 600)}`);

  const assistantMessages = latestItems(
    session.items,
    (item): item is Extract<ConversationItem, { type: "assistant_message" }> =>
      item.type === "assistant_message" &&
      (item.provider === undefined || item.provider === provider),
    5
  ).map((item) => `- ${truncate(item.body, 900)}`);

  const toolGroups = latestItems(
    session.items,
    (item): item is Extract<ConversationItem, { type: "tool_group" }> =>
      item.type === "tool_group" &&
      (item.provider === undefined || item.provider === provider),
    8
  ).map(formatToolGroupForHandoff);

  const notices = latestItems(
    session.items,
    (item): item is Extract<ConversationItem, { type: "notice" }> =>
      item.type === "notice",
    5
  ).map((item) => `- ${truncate(item.label, 500)}`);

  return [
    `# ${providerLabel} Handoff Summary`,
    "",
    `Handoff reason: ${reason}.`,
    "",
    `This summary was assembled deterministically from the visible Composer transcript because ${providerLabel} did not return a readable handoff summary.`,
    "",
    "## Recent User Requests",
    userMessages.length
      ? userMessages.join("\n")
      : "- No visible user requests found.",
    "",
    `## Recent ${providerLabel} Output`,
    assistantMessages.length
      ? assistantMessages.join("\n")
      : `- No visible ${providerLabel} assistant output found.`,
    "",
    "## Recent Tools, Commands, And File Activity",
    toolGroups.length
      ? toolGroups.join("\n")
      : `- No visible ${providerLabel} tool activity found.`,
    "",
    "## Errors Or Notices",
    notices.length ? notices.join("\n") : "- No visible errors or notices found.",
    "",
    "## Next Provider Guidance",
    "- Continue from the latest user request.",
    "- Re-inspect files or command output before relying on details that are not explicit above.",
    "- Treat this fallback summary as lower fidelity than a provider-generated handoff."
  ].join("\n");
}

function latestItems<T extends ConversationItem>(
  items: ConversationItem[],
  predicate: (item: ConversationItem) => item is T,
  limit: number
) {
  return items.filter(predicate).slice(-limit);
}

function formatToolGroupForHandoff(
  item: Extract<ConversationItem, { type: "tool_group" }>
) {
  const details = item.details
    .map((detail) => {
      const bits = [
        detail.command ? `command=${detail.command}` : undefined,
        detail.path ? `path=${detail.path}` : undefined,
        detail.output ? `output=${truncate(detail.output, 300)}` : undefined
      ].filter(Boolean);

      return bits.length
        ? `${detail.label} (${bits.join("; ")})`
        : detail.label;
    })
    .filter(Boolean)
    .slice(0, 4);

  return `- ${truncate(item.summary, 300)}${details.length ? `: ${details.join(" | ")}` : ""}`;
}

function truncate(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
}
