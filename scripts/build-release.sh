#!/usr/bin/env bash
#
# Build the Composer CLI release tarball and print its sha256 (for the Homebrew
# formula). The tarball is the single artifact consumed by both install paths:
# install.sh (curl) and packaging/homebrew/composer.rb (brew).
#
# Usage: scripts/build-release.sh
# Output: apps/cli/composer-cli-<version>.tgz  + sha256

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cli_dir="$repo_root/apps/cli"

cd "$cli_dir"
version="$(node -p 'require("./package.json").version')"
tarball="composer-cli-$version.tgz"

echo ":: Building $tarball (runs prepack: build runtime + client + bin + server)…"
rm -f "$tarball"
npm pack >/dev/null

if [ ! -f "$tarball" ]; then
  echo "xx Expected $tarball was not produced." >&2
  exit 1
fi

sha="$(shasum -a 256 "$tarball" | awk '{print $1}')"

echo
echo ":: Artifact : $cli_dir/$tarball"
echo ":: Version  : $version"
echo ":: sha256   : $sha"
echo
echo "Next steps:"
echo "  1. Upload $tarball to the GitHub release tag v$version."
echo "  2. Update packaging/homebrew/composer.rb url/version/sha256 with the above."
echo "  3. (Optional) npm publish --access public from apps/cli."
