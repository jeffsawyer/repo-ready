# Contributing

## Getting Started

```bash
yarn install
yarn start
```

## Commit Message Convention

This project follows the [Conventional Commits](https://www.conventionalcommits.org/en) specification. Each commit message must be prefixed with a type:

| Type       | Description                  | Appears in CHANGELOG |
|------------|------------------------------|----------------------|
| `feat`     | New feature                  | ✅                   |
| `fix`      | Bug fix                      | ✅                   |
| `refactor` | Code change (no feature/fix) | ✅                   |
| `perf`     | Performance improvement      | ✅                   |
| `docs`     | Documentation only           | ❌                   |
| `test`     | Adding or updating tests     | ❌                   |
| `build`    | Build system or dependencies | ❌                   |
| `ci`       | CI/CD configuration          | ❌                   |
| `chore`    | Maintenance / tooling        | ❌                   |
| `style`    | Formatting (no code change)  | ❌                   |

### Format

```
type(optional-scope): description

[optional body]

[optional footer]
```

### Examples

```bash
# ✅ Good
feat: add product comparison page
fix(cart): resolve quantity update race condition
docs: update contributing guide

# ❌ Bad
Added login page          # missing type
Fix: stuff                # wrong capitalization
FEAT: things              # uppercase type
```

### How it's enforced

- **Locally**: [lefthook](https://github.com/evilmartians/lefthook) runs [commitlint](https://commitlint.js.org/) on every commit via the `commit-msg` git hook
- **On GitHub**: A PR title check workflow validates that PR titles follow the same format (since we squash-merge, the PR title becomes the merge commit message)

## Pre-commit Hooks

[Lefthook](https://github.com/evilmartians/lefthook) runs the following hooks automatically:

| Hook                   | What it does                                                   |
|------------------------|----------------------------------------------------------------|
| `pre-commit` → format  | Runs Prettier on staged files                                  |
| `pre-commit` → lint    | Runs ESLint on staged files                                    |
| `prepare-commit-msg`   | Auto-appends Jira ticket from branch name (e.g. `[PROJ-123]`) |
| `commit-msg`           | Validates commit message follows conventional commits          |

Hooks are installed automatically. If they stop working, run:

```bash
npx lefthook install
```

> **Tip**: You can skip hooks in an emergency with `git commit --no-verify`, but avoid doing this regularly.

## Release Process

We squash-merge every PR into `main`. This means:

1. **Your PR title is the commit message** — make sure it follows conventional commits
2. **Your PR description is the changelog detail** — write it for someone who wasn't in the room

> **Important**: When squash-merging, GitHub stacks all individual commit messages into the merge body by default. Clean this up — remove the stacked messages and keep only a clear description of the change.

### What happens automatically on merge to `main`

1. [release-it](https://github.com/release-it/release-it) determines the version bump from commit types (`feat` → minor, `fix` → patch)
2. `CHANGELOG.md` is updated with the new version and its changes
3. `package.json` version is bumped
4. A git tag (`v1.2.3`) and GitHub Release are created

### Version bumping

Versions follow [Semantic Versioning](https://semver.org/):

| Commit type                  | Version bump  | Example       |
|------------------------------|---------------|---------------|
| `fix:`                       | Patch (0.0.X) | 1.2.3 → 1.2.4 |
| `feat:`                      | Minor (0.X.0) | 1.2.3 → 1.3.0 |
| `BREAKING CHANGE:` in footer | Major (X.0.0) | 1.2.3 → 2.0.0 |

### Dry run

To preview what a release would look like without making any changes:

```bash
npx release-it --dry-run --no-git.requireCleanWorkingDir
```

## Pull Requests

- Name your branch: `feature/JIRA-123-description`, `fix/JIRA-456-description`, `chore/JIRA-789-description`
- PR title must follow conventional commits — enforced by CI
- Squash merge is the default — your PR title becomes the changelog entry
- Fill out the PR template: describe what changed, how to test, and why

### Jira ticket in commits

A `prepare-commit-msg` hook automatically appends the Jira ticket number from your branch name to each commit message. For example, on branch `feature/PROJ-42-add-checkout`, a commit `feat: add cart total` becomes `feat: add cart total [PROJ-42]`.

- You don't need to manually include the ticket — the hook handles it
- If you do include it manually, the hook won't duplicate it
