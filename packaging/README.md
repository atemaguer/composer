# Packaging & distribution

The Composer CLI ships as a single npm tarball (`composer-cli-<version>.tgz`)
that bundles the built CLI, the self-contained runtime server, and the
`@composer/client` workspace package. One artifact feeds every install path.

## Pipeline overview

```
git tag cli-v<version>                 (or: workflow_dispatch with a version bump)
        │
        ▼
.github/workflows/cli-release.yml      build + test + scripts/build-release.sh
        │                              → composer-cli-<version>.tgz + latest.json
        ▼
gs://<GCP_UPDATES_BUCKET>/composer/cli/stable/
        ├── composer-cli-<version>.tgz   (immutable)
        ├── composer-cli-latest.tgz      (rolling)
        └── latest.json                  ({ version, tarball, sha256, … })
        │
        ▼
apps/web (getcomposer.dev) reads latest.json and serves:
        ├── /install.sh             → curl installer (sha-verified)
        ├── /homebrew/composer.rb   → Homebrew formula
        ├── /api/cli/manifest       → latest.json (JSON + CORS)
        └── /api/cli/download       → 302 → current tarball
```

## Install paths

### curl

```sh
curl -fsSL https://getcomposer.dev/install.sh | bash
```

The route bakes the current version/tarball-URL/sha256 into the script at
request time, so the script downloads the tarball, verifies the checksum, and
`npm install -g`s it — no extra round trips.

### Homebrew

```sh
brew install https://getcomposer.dev/homebrew/composer.rb
```

The formula is generated from `latest.json`, so the URL always installs the
current release. (For a `brew tap`, host the generated formula in a
`homebrew-tap` repo as `Formula/composer.rb`.)

### npm (direct)

```sh
npm install -g @composer/cli      # once published to the registry
```

## Requirements

- **Node.js >= 20** — required for `composer run`, `serve`, and the runtime
  server (uses `node:sqlite`).
- **Bun** — required for the interactive TUI (`composer` / `composer tui`). The
  scripted commands work without it.

## CI / infrastructure config

The release workflow reuses the desktop release's GCP setup:

| Name | Kind | Purpose |
|---|---|---|
| `GCP_UPDATES_BUCKET` | repo **variable** | GCS bucket (e.g. `composer-desktop-updates-bfloat`) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | secret | Workload Identity Federation provider |
| `GCP_SERVICE_ACCOUNT` | secret | service account with `storage.objectAdmin` on the bucket |

Website override (Vercel env): `COMPOSER_CLI_BASE_URL` — the public release
channel base (defaults to
`https://storage.googleapis.com/composer-desktop-updates-bfloat/composer/cli/stable`).
Bucket objects must be publicly readable.

## Cutting a release

Push a tag (CI builds + publishes):

```sh
git tag cli-v$(node -p "require('./apps/cli/package.json').version")
git push origin --tags
```

…or run the **CLI Release** workflow manually with a `version_bump` (it bumps
`apps/cli/package.json`, commits, tags `cli-v<version>`, and publishes).

## Local build / install (from a working tree)

```sh
scripts/build-release.sh                          # prints version + sha256
./install.sh --tarball apps/cli/composer-cli-$(node -p "require('./apps/cli/package.json').version").tgz
```
