const fallbackUrl = "https://getcomposer.dev";

function normalizeUrl(value: string | undefined) {
  if (!value) {
    return fallbackUrl;
  }

  const trimmed = value.trim().replace(/\/+$/, "");

  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export const siteConfig = {
  /**
   * Canonical production origin. Override per-environment with
   * NEXT_PUBLIC_SITE_URL (e.g. preview deploys) — falls back to the prod domain.
   */
  url: normalizeUrl(process.env.NEXT_PUBLIC_SITE_URL),
  name: "Composer",
  title: "Composer — Seamless Claude and Codex handoff",
  tagline: "Seamless Claude and Codex handoff.",
  description:
    "Start in Claude, continue in Codex, then switch back on the next prompt. Composer carries the context across agents so you never re-explain the work in another terminal.",
  ogImageAlt:
    "Composer keeps one continuous agent thread as work hands off between Claude and Codex.",
  twitter: "@composer",
} as const;

export function absoluteUrl(path = "") {
  const suffix = path.startsWith("/") || path === "" ? path : `/${path}`;
  return `${siteConfig.url}${suffix}`;
}
