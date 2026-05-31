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

c_info() { printf '\033[1;34m::\033[0m %s\n' "$*"; }
c_warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
c_err() {
  printf '\033[1;31mxx\033[0m %s\n' "$*" >&2
  exit 1
}

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
    *) c_err "Unknown argument: $1 (try --help)" ;;
  esac
done

CLI_BASE="${CLI_BASE%/}"

command -v node >/dev/null 2>&1 || c_err "Node.js (>=20) is required. Install from https://nodejs.org"
command -v npm >/dev/null 2>&1 || c_err "npm is required (it ships with Node.js)."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  c_warn "Node $NODE_MAJOR detected; Composer expects Node >= 20."
fi

if ! command -v bun >/dev/null 2>&1; then
  c_warn "Bun was not found — the interactive TUI requires it:"
  c_warn "    curl -fsSL https://bun.sh/install | bash"
  c_warn "  ('composer run' and 'composer serve' work without Bun.)"
fi

checksum() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  fi
}

if [ -n "$TARBALL" ]; then
  [ -f "$TARBALL" ] || c_err "Tarball not found: $TARBALL"
  c_info "Installing Composer from $TARBALL"
  npm install -g "$TARBALL"
else
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT

  SHA256=""
  if [ "$VERSION" = "latest" ]; then
    c_info "Resolving the latest release…"
    MANIFEST="$(curl -fsSL "$CLI_BASE/latest.json" || true)"
    [ -n "$MANIFEST" ] || c_err "Could not load $CLI_BASE/latest.json. Pass --version or --tarball."
    URL="$(printf '%s' "$MANIFEST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tarball||"")}catch{}})')"
    SHA256="$(printf '%s' "$MANIFEST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).sha256||"")}catch{}})')"
    [ -n "$URL" ] || c_err "Manifest did not contain a tarball URL."
  else
    URL="$CLI_BASE/composer-cli-${VERSION#v}.tgz"
  fi

  c_info "Downloading $URL"
  curl -fsSL "$URL" -o "$TMP/composer.tgz" || c_err "Download failed: $URL"

  if [ -n "$SHA256" ]; then
    ACTUAL="$(checksum "$TMP/composer.tgz")"
    if [ -n "$ACTUAL" ] && [ "$ACTUAL" != "$SHA256" ]; then
      c_err "Checksum mismatch (expected $SHA256, got $ACTUAL)."
    fi
  fi

  c_info "Installing globally via npm…"
  npm install -g "$TMP/composer.tgz"
fi

if command -v composer >/dev/null 2>&1; then
  c_info "Installed $(composer --version 2>/dev/null || echo composer) at $(command -v composer)"
  c_info "Run 'composer' inside a project to start, or 'composer --help'."
else
  c_warn "composer is not on your PATH. Add '$(npm prefix -g)/bin' to PATH."
fi
