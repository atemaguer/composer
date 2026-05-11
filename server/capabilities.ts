import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  CapabilityProvider,
  ComposerCapability,
  ComposerCapabilityCatalog,
  ComposerCapabilityCategory,
  ComposerCapabilityComponent,
  ComposerCapabilitySource
} from "../src/types.js";

type SkillRoot = {
  root: string;
  category: ComposerCapabilityCategory;
  source: ComposerCapabilitySource;
  providers: CapabilityProvider[];
  maxDepth: number;
};

type Frontmatter = Record<string, string>;

const home = os.homedir();
const skillRoots: SkillRoot[] = [
  {
    root: path.join(home, ".codex", "skills", ".system"),
    category: "System",
    source: "system",
    providers: ["codex", "claude"],
    maxDepth: 3
  },
  {
    root: path.join(home, ".codex", "skills"),
    category: "Personal",
    source: "codex",
    providers: ["codex", "claude"],
    maxDepth: 3
  },
  {
    root: path.join(home, ".agents", "skills"),
    category: "Personal",
    source: "shared",
    providers: ["codex", "claude"],
    maxDepth: 3
  },
  {
    root: path.join(home, ".claude", "skills"),
    category: "Personal",
    source: "claude",
    providers: ["codex", "claude"],
    maxDepth: 3
  },
  {
    root: path.join(home, ".codex", "plugins", "cache"),
    category: "Personal",
    source: "marketplace",
    providers: ["codex", "claude"],
    maxDepth: 8
  }
];

const pluginRoots = [
  path.join(home, ".codex", "plugins", "cache"),
  path.join(home, ".claude", "plugins"),
  path.join(home, ".claude", "local-plugins")
];

export async function loadCapabilityCatalog(): Promise<ComposerCapabilityCatalog> {
  const [skills, plugins] = await Promise.all([loadSkills(), loadPlugins()]);
  const installedNames = new Set(
    [...skills, ...plugins].map((item) => item.name.toLowerCase())
  );

  return {
    generatedAt: new Date().toISOString(),
    items: [
      ...recommendedCapabilities(installedNames),
      ...dedupeCapabilities([...plugins, ...skills])
    ]
  };
}

export async function readCapabilityContent(filePath: string) {
  const resolvedPath = path.resolve(filePath);

  if (!isAllowedCapabilityPath(resolvedPath)) {
    throw new Error("Capability path is outside configured skill and plugin roots");
  }

  const raw = await readText(resolvedPath);

  if (path.basename(resolvedPath) === "SKILL.md") {
    return {
      path: resolvedPath,
      content: stripFrontmatter(raw)
    };
  }

  return {
    path: resolvedPath,
    content: `\`\`\`json\n${JSON.stringify(JSON.parse(raw), null, 2)}\n\`\`\``
  };
}

async function loadSkills() {
  const found: ComposerCapability[] = [];

  await Promise.all(
    skillRoots.map(async (rootConfig) => {
      const files = await findFiles(rootConfig.root, "SKILL.md", rootConfig.maxDepth, 360);

      await Promise.all(
        files.map(async (file) => {
          if (
            rootConfig.root.endsWith(path.join(".codex", "skills")) &&
            file.includes(`${path.sep}.system${path.sep}`)
          ) {
            return;
          }

          const content = await readText(file);
          const parsed = parseSkill(content, path.basename(path.dirname(file)));
          const pluginName = inferPluginName(file);

          found.push({
            id: stableId("skill", file),
            kind: "skill",
            name: parsed.name,
            description: parsed.description,
            category: rootConfig.category,
            source: rootConfig.source,
            providers: rootConfig.providers,
            path: file,
            pluginName,
            iconKey: iconKeyFor(parsed.name, pluginName),
            installed: true,
            enabled: true,
            components: ["skills"]
          });
        })
      );
    })
  );

  return found;
}

async function loadPlugins() {
  const manifests = (
    await Promise.all(
      pluginRoots.flatMap((root) => [
        findFiles(root, "plugin.json", 8, 160, ".codex-plugin"),
        findFiles(root, "plugin.json", 8, 160, ".claude-plugin")
      ])
    )
  ).flat();

  const plugins = await Promise.all(
    manifests.map(async (manifestPath): Promise<ComposerCapability | null> => {
      try {
        const raw = await readText(manifestPath);
        const manifest = JSON.parse(raw) as Record<string, unknown>;
        const pluginRoot = path.dirname(path.dirname(manifestPath));
        const name = readManifestName(manifest, pluginRoot);
        const description = readManifestDescription(manifest);
        const components = await detectPluginComponents(pluginRoot, manifest);

        return {
          id: stableId("plugin", pluginRoot),
          kind: "plugin",
          name,
          description,
          category: "Personal",
          source: "marketplace",
          providers: ["codex", "claude"],
          path: pluginRoot,
          iconKey: iconKeyFor(name),
          installed: true,
          enabled: true,
          components
        };
      } catch {
        return null;
      }
    })
  );

  return plugins.filter((plugin): plugin is ComposerCapability => Boolean(plugin));
}

function recommendedCapabilities(installedNames: Set<string>): ComposerCapability[] {
  const recommended: Array<Pick<
    ComposerCapability,
    "id" | "name" | "description" | "iconKey" | "components"
  >> = [
    {
      id: "recommended-pdf",
      name: "PDF",
      description: "Create, edit, and review PDFs.",
      iconKey: "pdf",
      components: ["skills"]
    },
    {
      id: "recommended-playwright",
      name: "Playwright",
      description: "Automate real browsers for app verification.",
      iconKey: "playwright",
      components: ["skills", "mcp"]
    }
  ];

  return recommended.map((item) => {
    const installed = installedNames.has(item.name.toLowerCase());

    return {
      ...item,
      kind: "skill",
      category: "Recommended",
      source: "marketplace",
      providers: ["codex", "claude"],
      installed,
      enabled: installed,
      recommended: true
    };
  });
}

async function detectPluginComponents(
  pluginRoot: string,
  manifest: Record<string, unknown>
): Promise<ComposerCapabilityComponent[]> {
  const checks: Array<[ComposerCapabilityComponent, boolean | Promise<boolean>]> = [
    ["skills", hasComponent(pluginRoot, "skills", manifest.skills)],
    ["mcp", hasComponent(pluginRoot, ".mcp.json", manifest.mcpServers)],
    ["hooks", hasComponent(pluginRoot, "hooks", manifest.hooks)],
    ["apps", hasComponent(pluginRoot, ".app.json", manifest.apps)],
    ["agents", hasComponent(pluginRoot, "agents", manifest.agents)],
    ["commands", hasComponent(pluginRoot, "commands", manifest.commands)],
    ["lsp", hasComponent(pluginRoot, ".lsp.json", manifest.lspServers)],
    ["monitors", hasComponent(pluginRoot, "monitors", manifest.monitors)]
  ];
  const resolved = await Promise.all(
    checks.map(async ([component, present]) => [component, await present] as const)
  );

  return resolved
    .filter(([, present]) => present)
    .map(([component]) => component);
}

async function hasComponent(
  pluginRoot: string,
  relativePath: string,
  manifestValue: unknown
) {
  return Boolean(manifestValue) || pathExists(path.join(pluginRoot, relativePath));
}

async function findFiles(
  root: string,
  filename: string,
  maxDepth: number,
  limit: number,
  requiredParent?: string
) {
  const results: string[] = [];

  async function walk(directory: string, depth: number) {
    if (results.length >= limit || depth > maxDepth) {
      return;
    }

    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(
      entries.map(async (entry) => {
        if (results.length >= limit) {
          return;
        }

        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".git") {
            return;
          }

          await walk(fullPath, depth + 1);
          return;
        }

        if (
          entry.isFile() &&
          entry.name === filename &&
          (!requiredParent || path.basename(path.dirname(fullPath)) === requiredParent)
        ) {
          results.push(fullPath);
        }
      })
    );
  }

  await walk(root, 0);
  return results;
}

function parseSkill(content: string, fallbackName: string) {
  const frontmatter = parseFrontmatter(content);
  const body = stripFrontmatter(content);
  const name = frontmatter.name || titleFromSlug(fallbackName);
  const description =
    frontmatter.description ||
    firstPlainSentence(body) ||
    "Reusable instructions for agent workflows.";

  return { name, description };
}

function stripFrontmatter(content: string) {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

function parseFrontmatter(content: string): Frontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter: Frontmatter = {};

  if (!match) {
    return frontmatter;
  }

  for (const line of match[1].split(/\r?\n/)) {
    const parts = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!parts) {
      continue;
    }

    frontmatter[parts[1]] = parts[2].replace(/^["']|["']$/g, "").trim();
  }

  return frontmatter;
}

function firstPlainSentence(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find((line) => line.length > 20)
    ?.slice(0, 180);
}

function readManifestName(manifest: Record<string, unknown>, pluginRoot: string) {
  const ui = isRecord(manifest.interface) ? manifest.interface : {};
  const value = ui.displayName || manifest.displayName || manifest.name;

  return typeof value === "string" && value.trim()
    ? value.trim()
    : titleFromSlug(path.basename(pluginRoot));
}

function readManifestDescription(manifest: Record<string, unknown>) {
  const ui = isRecord(manifest.interface) ? manifest.interface : {};
  const value = ui.shortDescription || ui.description || manifest.description;

  return typeof value === "string" && value.trim()
    ? value.trim()
    : "Shared plugin package for agent extensions.";
}

function inferPluginName(file: string) {
  const parts = file.split(path.sep);
  const skillsIndex = parts.lastIndexOf("skills");

  if (skillsIndex > 0) {
    const pluginRoot = parts[skillsIndex - 1];

    if (pluginRoot && pluginRoot !== ".system") {
      return titleFromSlug(pluginRoot);
    }
  }

  return undefined;
}

function dedupeCapabilities(items: ComposerCapability[]) {
  const best = new Map<string, ComposerCapability>();

  for (const item of items) {
    const key = `${item.kind}:${item.path ?? item.name.toLowerCase()}`;
    const existing = best.get(key);

    if (!existing || categoryRank(item.category) < categoryRank(existing.category)) {
      best.set(key, item);
    }
  }

  return [...best.values()].sort((a, b) => {
    const categoryDelta = categoryRank(a.category) - categoryRank(b.category);
    if (categoryDelta !== 0) {
      return categoryDelta;
    }

    const kindDelta = a.kind.localeCompare(b.kind);
    if (kindDelta !== 0) {
      return kindDelta;
    }

    return a.name.localeCompare(b.name);
  });
}

function categoryRank(category: ComposerCapabilityCategory) {
  return category === "Recommended" ? 0 : category === "System" ? 1 : 2;
}

function stableId(prefix: string, value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return `${prefix}-${hash.toString(16)}`;
}

async function readText(file: string) {
  return fs.readFile(file, "utf8");
}

function isAllowedCapabilityPath(filePath: string) {
  if (
    path.basename(filePath) !== "SKILL.md" &&
    path.basename(filePath) !== "plugin.json"
  ) {
    return false;
  }

  if (
    path.basename(filePath) === "plugin.json" &&
    ![".codex-plugin", ".claude-plugin"].includes(path.basename(path.dirname(filePath)))
  ) {
    return false;
  }

  return [...skillRoots.map((root) => root.root), ...pluginRoots]
    .map((root) => path.resolve(root))
    .some((root) => filePath === root || filePath.startsWith(`${root}${path.sep}`));
}

async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function titleFromSlug(value: string) {
  return value
    .replace(/\.(md|json)$/i, "")
    .split(/[-_\s:]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function iconKeyFor(name: string, pluginName?: string) {
  const value = `${name} ${pluginName ?? ""}`.toLowerCase();

  if (value.includes("pdf")) return "pdf";
  if (value.includes("image")) return "image";
  if (value.includes("openai")) return "openai";
  if (value.includes("browser") || value.includes("playwright") || value.includes("chrome")) return "browser";
  if (value.includes("document")) return "documents";
  if (value.includes("spreadsheet") || value.includes("excel")) return "spreadsheets";
  if (value.includes("presentation") || value.includes("powerpoint")) return "presentations";
  if (value.includes("github")) return "github";
  if (value.includes("gmail")) return "gmail";
  if (value.includes("calendar")) return "calendar";
  if (value.includes("vercel")) return "vercel";
  if (value.includes("expo")) return "expo";
  if (value.includes("plugin")) return "plugin";
  return "skill";
}
