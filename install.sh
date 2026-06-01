#!/usr/bin/env bash
#
# Composer CLI installer.
#
# End users normally install via the website (which serves this same flow):
#
#   curl -fsSL https://getcomposer.dev/install.sh | bash
#
# This script is the source of truth and also supports installing a local build:
#
#   ./install.sh --tarball apps/cli/composer-cli-0.1.0.tgz
#
# Environment overrides: COMPOSER_CLI_BASE (release channel URL),
# COMPOSER_VERSION, COMPOSER_TARBALL.

set -euo pipefail

# Public release channel in the GCS bucket (see .github/workflows/cli-release.yml).
CLI_BASE="${COMPOSER_CLI_BASE:-https://storage.googleapis.com/composer-desktop-updates-bfloat/composer/cli/stable}"
VERSION="${COMPOSER_VERSION:-latest}"
TARBALL="${COMPOSER_TARBALL:-}"

# --- presentation -----------------------------------------------------------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[1;32m'
  YELLOW=$'\033[1;33m'; RED=$'\033[1;31m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; GREEN=''; YELLOW=''; RED=''; RESET=''
fi

ok()   { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
fail() { printf '%s✗%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Composer CLI installer

Usage: install.sh [options]
  --tarball <path>   Install from a local .tgz instead of downloading.
  --version <ver>    Install a specific version (e.g. 0.1.0). Default: latest.
  --base <url>       Release channel base URL (defaults to the GCS bucket).
  -h, --help         Show this help.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --tarball) TARBALL="${2:?--tarball needs a path}"; shift 2 ;;
    --version) VERSION="${2:?--version needs a version}"; shift 2 ;;
    --base) CLI_BASE="${2:?--base needs a url}"; shift 2 ;;
    -h | --help) usage; exit 0 ;;
    *) fail "Unknown argument: $1 (try --help)" ;;
  esac
done

CLI_BASE="${CLI_BASE%/}"

printf '\n%sComposer CLI Installer%s\n\n' "$BOLD" "$RESET"

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

checksum() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  fi
}

# --- resolve + fetch --------------------------------------------------------
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ARTIFACT=""

if [ -n "$TARBALL" ]; then
  [ -f "$TARBALL" ] || fail "Tarball not found: $TARBALL"
  ARTIFACT="$TARBALL"
  ok "Using local tarball $TARBALL"
else
  SHA256=""
  if [ "$VERSION" = "latest" ]; then
    MANIFEST="$(curl -fsSL "$CLI_BASE/latest.json" || true)"
    [ -n "$MANIFEST" ] || fail "Could not load $CLI_BASE/latest.json. Pass --version or --tarball."
    URL="$(printf '%s' "$MANIFEST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tarball||"")}catch{}})')"
    SHA256="$(printf '%s' "$MANIFEST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).sha256||"")}catch{}})')"
    VERSION="$(printf '%s' "$MANIFEST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).version||"latest")}catch{}})')"
    [ -n "$URL" ] || fail "Manifest did not contain a tarball URL."
  else
    URL="$CLI_BASE/composer-cli-${VERSION#v}.tgz"
  fi

  curl -fsSL "$URL" -o "$TMP/composer.tgz" || fail "Download failed: $URL"
  ARTIFACT="$TMP/composer.tgz"
  ok "Downloaded Composer CLI v$VERSION"

  if [ -n "$SHA256" ]; then
    ACTUAL="$(checksum "$ARTIFACT")"
    if [ -n "$ACTUAL" ] && [ "$ACTUAL" != "$SHA256" ]; then
      fail "Checksum mismatch (expected $SHA256, got $ACTUAL)."
    fi
    [ -n "$ACTUAL" ] && ok "Verified checksum"
  fi
fi

# --- install (npm noise hidden unless it fails) -----------------------------
if npm install -g "$ARTIFACT" >"$TMP/npm.log" 2>&1; then
  ok "Installed globally via npm"
else
  cat "$TMP/npm.log" >&2
  fail "npm install failed (output above)."
fi

BIN="$(command -v composer 2>/dev/null || true)"
[ -n "$BIN" ] || fail "Installed, but 'composer' is not on your PATH — add $(npm prefix -g)/bin to PATH."
ok "Linked composer at $BIN"

# --- done -------------------------------------------------------------------
printf '\n%s✨ Installation complete!%s\n\n' "$GREEN" "$RESET"
printf '%sStart using Composer:%s\n' "$BOLD" "$RESET"
printf '    composer\n'
printf '    %scomposer --help%s   see all commands\n\n' "$DIM" "$RESET"

if [ "$BUN_OK" -eq 0 ]; then
  printf '%s!%s the interactive TUI needs Bun — %scurl -fsSL https://bun.sh/install | bash%s\n\n' "$YELLOW" "$RESET" "$DIM" "$RESET"
fi

printf '%sHappy coding!%s 🚀\n' "$DIM" "$RESET"
