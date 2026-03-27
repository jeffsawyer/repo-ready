# repo-ready

Zero-friction release automation setup for JS/TS repos. One command wires up release-it, conventional changelog, commitlint, lefthook, GitHub Actions, Slack notifications, and more.

## Usage
```bash
npx @jeffsawyer/repo-ready
```

Or install globally:
```bash
npm install -g @jeffsawyer/repo-ready
repo-ready
```

## What it sets up

**Always:**
- [`release-it`](https://github.com/release-it/release-it) + [`@release-it/conventional-changelog`](https://github.com/release-it/conventional-changelog) for automated versioning and changelog
- `.release-it.json` with opinionated defaults (conventional commits, GitHub releases, no npm publish)
- `.github/workflows/release.yml` — reusable release workflow (callable via `workflow_call` or manually via `workflow_dispatch`)
- `.github/workflows/deploy-and-release.yml` — example caller workflow, wired to your production branch
- `.github/workflows/pr-title.yml` — enforces conventional commit format on PR titles
- `.github/pull_request_template.md`
- `CONTRIBUTING.md` with commit conventions, release process, and PR guidelines
- `CHANGELOG.md` (if missing)

**Optional:**
- `commitlint` + `lefthook` + `prettier` + `eslint` for local commit and code quality enforcement
  - Auto-appends issue ID from branch name — supports Jira, Linear, GitHub Issues, or a custom pattern
  - Prettier and ESLint run automatically on staged files
- Slack release notification via [slackapi/slack-github-action](https://github.com/slackapi/slack-github-action)

## Philosophy

This tool is built around a **squash-merge workflow**:

1. Every PR is squash-merged into your production branch
2. The PR title becomes the commit message — so it must follow conventional commits
3. `release-it` reads those commits to determine version bumps and generate the changelog
4. The release workflow fires automatically on every push to your production branch

This means your changelog writes itself, versions are always correct, and your team only needs to follow one rule: **write a good PR title**.

## Supported package managers

npm, yarn, pnpm, and bun are all detected automatically from your lockfile.

## Requirements

- Node.js 18+
- A `package.json` in the current directory (or let repo-ready create one)
- Git initialized

## GitHub Secrets

| Secret                      | Required         | Description                      |
|-----------------------------|------------------|----------------------------------|
| `GITHUB_TOKEN`              | Always           | Auto-provided by GitHub Actions  |
| `SLACK_RELEASE_WEBHOOK_URL` | If Slack enabled | Slack Incoming Webhook URL       |

## Local development
```bash
git clone https://github.com/jeffsawyer/repo-ready
cd repo-ready
yarn install
yarn dev
```

## License

MIT
