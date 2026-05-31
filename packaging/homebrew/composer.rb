# Homebrew formula for the Composer CLI.
#
# The website serves a dynamically-generated, always-current version of this
# formula (built from the release manifest), so the primary install is:
#
#   brew install https://getcomposer.dev/homebrew/composer.rb
#
# This file is the static reference for a `brew tap`. To use a tap, sync it to a
# `homebrew-tap` repo as Formula/composer.rb and update `url`/`version`/`sha256`
# on each release (the cli-release workflow publishes the matching tarball;
# scripts/build-release.sh prints the sha256 for local builds).
class Composer < Formula
  desc "CLI and interactive TUI for the Composer coding agent"
  homepage "https://getcomposer.dev"
  url "https://storage.googleapis.com/composer-desktop-updates-bfloat/composer/cli/stable/composer-cli-0.1.0.tgz"
  version "0.1.0"
  sha256 "b489686090d0c7500d6d0dfdd97e9a5791ded7fb4c74fc206695ba747e4ed50a"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def caveats
    <<~EOS
      Composer's interactive TUI requires Bun:
        brew install bun
      The `composer run` and `composer serve` commands work without it.
    EOS
  end

  test do
    assert_match "Usage", shell_output("#{bin}/composer --help")
    assert_match version.to_s, shell_output("#{bin}/composer --version")
  end
end
