# Composer Docs

This folder contains the Mintlify documentation site for Composer.

## Local preview

Install the Mintlify CLI if needed:

```bash
npm i -g mint
```

Mintlify requires Node.js 20.17.0 or higher and currently rejects Node 25+.
Use an LTS-compatible Node version when running these commands.

Run the docs from this directory:

```bash
mint dev
```

## Validation

```bash
mint validate
```

## Mintlify deployment

Configure the Mintlify project as a monorepo and set the documentation path to `/docs` without a trailing slash.
