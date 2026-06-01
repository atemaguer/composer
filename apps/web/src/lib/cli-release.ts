import { siteConfig } from "./site";

/**
 * Public base URL of the Composer CLI release channel in the GCS bucket. The
 * CLI release GitHub Action uploads `composer-cli-<version>.tgz`,
 * `composer-cli-latest.tgz`, and `latest.json` here. Override per-environment
 * with COMPOSER_CLI_BASE_URL (mirrors COMPOSER_DOWNLOAD_BASE_URL for desktop).
 */
const DEFAULT_CLI_BASE_URL =
  "https://storage.googleapis.com/composer-desktop-updates-bfloat/composer/cli/stable";

export function cliBaseUrl(): string {
  return (
    process.env.COMPOSER_CLI_BASE_URL?.replace(/\/+$/u, "") ??
    DEFAULT_CLI_BASE_URL
  );
}

export type CliManifest = {
  version: string;
  /** Absolute URL of the versioned tarball. */
  tarball: string;
  /** Absolute URL of the channel's rolling "latest" tarball. */
  tarballLatest?: string;
  sha256: string;
  channel?: string;
  generatedAt?: string;
};

/** Fetch the published `latest.json` manifest from the release bucket. */
export async function fetchCliManifest(): Promise<CliManifest> {
  const response = await fetch(`${cliBaseUrl()}/latest.json`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Composer CLI manifest unavailable (${response.status}).`);
  }

  const data = (await response.json()) as Partial<CliManifest>;

  if (!data.version || !data.tarball || !data.sha256) {
    throw new Error("Composer CLI manifest is missing required fields.");
  }

  return {
    version: data.version,
    tarball: data.tarball,
    tarballLatest: data.tarballLatest ?? `${cliBaseUrl()}/composer-cli-latest.tgz`,
    sha256: data.sha256,
    channel: data.channel,
    generatedAt: data.generatedAt
  };
}

/**
 * The shell installer served at /install.sh. Version/url/sha are baked in at
 * request time from the manifest, so `curl … | bash` needs no extra round trip.
 */
export function renderInstallScript(manifest: CliManifest): string {
  return `#!/usr/bin/env bash
#
# Composer CLI installer — https://${hostname()}
#
#   curl -fsSL https://${hostname()}/install.sh | bash
#
set -euo pipefail

VERSION="${manifest.version}"
TARBALL_URL="${manifest.tarball}"
SHA256="${manifest.sha256}"

# --- presentation -----------------------------------------------------------
if [ -t 1 ] && [ -z "\${NO_COLOR:-}" ]; then
  BOLD=$'\\033[1m'; DIM=$'\\033[2m'; GREEN=$'\\033[1;32m'
  YELLOW=$'\\033[1;33m'; RED=$'\\033[1;31m'; RESET=$'\\033[0m'
else
  BOLD=''; DIM=''; GREEN=''; YELLOW=''; RED=''; RESET=''
fi

ok()   { printf '%s✓%s %s\\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%s!%s %s\\n' "$YELLOW" "$RESET" "$*" >&2; }
fail() { printf '%s✗%s %s\\n' "$RED" "$RESET" "$*" >&2; exit 1; }

printf '\\n%sComposer CLI Installer%s\\n\\n' "$BOLD" "$RESET"

# --- environment ------------------------------------------------------------
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
ok "Detected $OS/$ARCH"

command -v node >/dev/null 2>&1 || fail "Node.js (>= 20) is required — https://nodejs.org"
command -v npm  >/dev/null 2>&1 || fail "npm is required (it ships with Node.js)."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || warn "Node $NODE_MAJOR detected; Composer expects Node >= 20."
ok "Node $(node -v) detected"

BUN_OK=1
command -v bun >/dev/null 2>&1 || BUN_OK=0

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- download + verify ------------------------------------------------------
curl -fsSL "$TARBALL_URL" -o "$TMP/composer.tgz" || fail "Download failed: $TARBALL_URL"
ok "Downloaded Composer CLI v$VERSION"

if command -v shasum >/dev/null 2>&1; then
  ACTUAL="$(shasum -a 256 "$TMP/composer.tgz" | awk '{print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$TMP/composer.tgz" | awk '{print $1}')"
else
  ACTUAL=""
fi
if [ -n "$ACTUAL" ] && [ "$ACTUAL" != "$SHA256" ]; then
  fail "Checksum mismatch (expected $SHA256, got $ACTUAL)."
fi
[ -n "$ACTUAL" ] && ok "Verified checksum"

# --- install (npm noise hidden unless it fails) -----------------------------
if npm install -g "$TMP/composer.tgz" >"$TMP/npm.log" 2>&1; then
  ok "Installed globally via npm"
else
  cat "$TMP/npm.log" >&2
  fail "npm install failed (output above)."
fi

BIN="$(command -v composer 2>/dev/null || true)"
[ -n "$BIN" ] || fail "Installed, but 'composer' is not on your PATH — add $(npm prefix -g)/bin to PATH."
ok "Linked composer at $BIN"

# --- done -------------------------------------------------------------------
printf '\\n%s✨ Installation complete!%s\\n\\n' "$GREEN" "$RESET"
printf '%sStart using Composer:%s\\n' "$BOLD" "$RESET"
printf '    composer\\n'
printf '    %scomposer --help%s   see all commands\\n\\n' "$DIM" "$RESET"

if [ "$BUN_OK" -eq 0 ]; then
  printf '%s!%s the interactive TUI needs Bun — %scurl -fsSL https://bun.sh/install | bash%s\\n\\n' "$YELLOW" "$RESET" "$DIM" "$RESET"
fi

printf '%sHappy coding!%s 🚀\\n' "$DIM" "$RESET"
`;
}

/**
 * The Homebrew formula served at /homebrew/composer.rb, generated from the
 * manifest so `brew install https://…/homebrew/composer.rb` always installs the
 * current release.
 */
export function renderHomebrewFormula(manifest: CliManifest): string {
  return `# Composer CLI Homebrew formula (generated — https://${hostname()}/homebrew/composer.rb)
#
#   brew install https://${hostname()}/homebrew/composer.rb
#
class Composer < Formula
  desc "CLI and interactive TUI for the Composer coding agent"
  homepage "https://${hostname()}"
  url "${manifest.tarball}"
  version "${manifest.version}"
  sha256 "${manifest.sha256}"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def caveats
    <<~EOS
      Composer's interactive TUI requires Bun:
        brew install bun
      The \`composer run\` and \`composer serve\` commands work without it.
    EOS
  end

  test do
    assert_match "Usage", shell_output("#{bin}/composer --help")
    assert_match version.to_s, shell_output("#{bin}/composer --version")
  end
end
`;
}

function hostname(): string {
  try {
    return new URL(siteConfig.url).host;
  } catch {
    return "getcomposer.dev";
  }
}
