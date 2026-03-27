import fs from "fs-extra";
import { existsSync } from "fs";
import ora from "ora";
import type { UserConfig } from "./prompts.js";
import type { DetectResult } from "./detect.js";
import {
  generateReleaseWorkflow,
  generateDeployWorkflow,
  generatePrTitleWorkflow,
} from "./workflows.js";
import { generateContributing } from "./contributing.js";

export interface GeneratedFiles {
  paths: string[];
}

export async function generateFiles(
  config: UserConfig,
  detected: DetectResult
): Promise<GeneratedFiles> {
  const spinner = ora("Generating files").start();
  const generated: string[] = [];

  try {
    await fs.ensureDir(".github/workflows");

    // .release-it.json
    if (config.overwriteReleaseIt) {
      await fs.writeJson(".release-it.json", releaseItConfig(), { spaces: 2 });
      generated.push(".release-it.json");
    }

    // GitHub workflows
    await fs.writeFile(".github/workflows/release.yml", generateReleaseWorkflow(config, detected));
    generated.push(".github/workflows/release.yml");

    await fs.writeFile(".github/workflows/deploy-and-release.yml", generateDeployWorkflow(config));
    generated.push(".github/workflows/deploy-and-release.yml");

    await fs.writeFile(".github/workflows/pr-title.yml", generatePrTitleWorkflow());
    generated.push(".github/workflows/pr-title.yml");

    // PR template
    if (config.overwritePrTemplate) {
      await fs.writeFile(".github/pull_request_template.md", prTemplate());
      generated.push(".github/pull_request_template.md");
    }

    // commitlint + lefthook + prettier + eslint
    if (config.includeCommitlint) {
      // Always use .mjs to avoid ESM/CJS conflicts regardless of project type
      await fs.writeFile("commitlint.config.mjs", commitlintConfig());
      generated.push("commitlint.config.mjs");

      await fs.writeFile("lefthook.yml", lefthookConfig(config.issueTracker !== "none"));
      generated.push("lefthook.yml");

      await fs.writeFile(".prettierrc", prettierConfig());
      generated.push(".prettierrc");

      await fs.writeFile("eslint.config.js", eslintConfig());
      generated.push("eslint.config.js");

      if (config.issueTracker !== "none") {
        await fs.ensureDir(".lefthook/prepare-commit-msg");
        await fs.writeFile(
          ".lefthook/prepare-commit-msg/add-tracked-issue.sh",
          issueTrackerScript(config.issueTracker, config.customIssuePattern)
        );
        await fs.chmod(".lefthook/prepare-commit-msg/add-tracked-issue.sh", "755");
        generated.push(".lefthook/prepare-commit-msg/add-tracked-issue.sh");
      }
    }

    // CONTRIBUTING.md
    if (config.overwriteContributing) {
      await fs.writeFile("CONTRIBUTING.md", generateContributing(config, detected));
      generated.push("CONTRIBUTING.md");
    }

    // CHANGELOG.md (only if missing)
    if (!existsSync("CHANGELOG.md")) {
      await fs.writeFile("CHANGELOG.md", "# Changelog\n");
      generated.push("CHANGELOG.md");
    }

    spinner.succeed("Files generated");
    return { paths: generated };
  } catch (err: unknown) {
    spinner.fail("File generation failed");
    throw err;
  }
}

function releaseItConfig() {
  return {
    git: {
      requireCleanWorkingDir: true,
      commitMessage: "chore: release v${version} [skip ci]",
      tagName: "v${version}",
    },
    npm: {
      publish: false,
    },
    github: {
      release: true,
      releaseName: "v${version}",
      autoGenerate: true,
    },
    plugins: {
      "@release-it/conventional-changelog": {
        preset: {
          name: "conventionalcommits",
          types: [
            { type: "feat", section: "Features" },
            { type: "fix", section: "Bug Fixes" },
            { type: "refactor", section: "Code Refactoring" },
            { type: "perf", section: "Performance Improvements" },
            { type: "docs", hidden: true },
            { type: "test", hidden: true },
            { type: "build", hidden: true },
            { type: "ci", hidden: true },
            { type: "chore", hidden: true },
            { type: "style", hidden: true },
          ],
        },
        infile: "CHANGELOG.md",
        header:
          "# Changelog\n\nAll notable changes to this project will be documented in this file.",
      },
    },
  };
}

function prTemplate(): string {
  return `## Description
<!-- PR title must be conventional: feat: / fix: / chore: / etc. — it becomes the changelog entry -->

## Type of change

- [ ] feat (new feature)
- [ ] fix (bug fix)
- [ ] chore (maintenance)
- [ ] docs (documentation)
- [ ] refactor (code change with no feature/fix)

## Summary
<!-- Brief description of what changed and why -->

## Reviewer Testing
<!-- Steps to verify the change -->
1.
2.
3.

## Expected Outcome
<!-- What should reviewers see? Include screenshots or GIFs for visual changes -->

## Additional Notes
<!-- Any extra context, new env vars, package updates, etc. Delete if not needed -->

<!--
  Reminders:
  - PR title follows conventional commits (enforced by CI)
  - UI/Copy checked with UX team if applicable
  - Tested locally or in sandbox
-->
`;
}

function commitlintConfig(): string {
  return `export default { extends: ["@commitlint/config-conventional"] };\n`;
}

function prettierConfig(): string {
  return (
    JSON.stringify(
      {
        semi: true,
        singleQuote: false,
        trailingComma: "es5",
        printWidth: 100,
        tabWidth: 2,
        useTabs: false,
      },
      null,
      2
    ) + "\n"
  );
}

function eslintConfig(): string {
  return `import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", ".astro/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
`;
}

function lefthookConfig(includeIssueTracker: boolean): string {
  const prepareHook = includeIssueTracker
    ? `
prepare-commit-msg:
  scripts:
    'add-tracked-issue.sh':
      runner: bash
`
    : "";

  return `pre-commit:
  commands:
    format:
      glob: '**/*.{js,jsx,ts,tsx}'
      exclude: '**/node_modules/**'
      run: npx prettier --write {staged_files} && git add {staged_files}
    lint:
      glob: '**/*.{js,jsx,ts,tsx}'
      exclude: '**/node_modules/**'
      run: npx eslint --fix --no-warn-ignored {staged_files} && git add {staged_files}
${prepareHook}
commit-msg:
  commands:
    commitlint:
      run: npx commitlint --edit {1}
`;
}

function issueTrackerScript(
  tracker: "jira" | "github" | "linear" | "custom",
  customPattern: string
): string {
  const patterns: Record<string, { pattern: string; prefix: string; suffix: string }> = {
    jira: { pattern: "[A-Z]{2,5}-[0-9]{1,4}", prefix: "[", suffix: "]" },
    linear: { pattern: "[A-Z]{2,5}-[0-9]{1,4}", prefix: "[", suffix: "]" },
    github: { pattern: "#?[0-9]{1,6}", prefix: "(#", suffix: ")" },
    custom: { pattern: customPattern, prefix: "[", suffix: "]" },
  };

  const { pattern, prefix, suffix } = patterns[tracker];

  return `#!/bin/bash
COMMIT_MSG_FILE=$1
COMMIT_SOURCE=$2
SHA1=$3

# Auto-appends issue ID from branch name to commit message.
# Supports Jira (PROJ-123), Linear (ENG-123), GitHub (#123), or custom patterns.
# Set SKIP_PREPARE_COMMIT_MSG=1 to disable.
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

if [ -n "$BRANCH_NAME" ] && [ "$BRANCH_NAME" != "HEAD" ] && [ "$SKIP_PREPARE_COMMIT_MSG" != "1" ]; then
    ISSUE_PATTERN='${pattern}'
    if [[ $BRANCH_NAME =~ $ISSUE_PATTERN ]]; then
        ISSUE_ID=\${BASH_REMATCH[0]}
        ALREADY_IN_COMMIT=$(grep -c "${prefix}\${ISSUE_ID}${suffix}" "$COMMIT_MSG_FILE" || true)

        if [ -n "$ISSUE_ID" ] && [ "$ALREADY_IN_COMMIT" -eq 0 ]; then
            sed -i.bak -e "1s,$, ${prefix}\${ISSUE_ID}${suffix}," "$COMMIT_MSG_FILE"
        fi
    fi
fi
`;
}
