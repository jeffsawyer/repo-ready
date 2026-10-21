import type { UserConfig } from "./prompts.js";
import { commandsFor, declaredPackageManager } from "./detect.js";

export function generateReleaseWorkflow(config: UserConfig): string {
  const { nodeVersion, includeSlack, pm } = config;
  const { frozenInstallCmd, runCmd } = commandsFor(pm);

  // pnpm and bun need their own setup before install. setup-node's pnpm
  // cache only works once the pnpm binary is already on PATH.
  const setupStep =
    pm === "bun"
      ? `      - uses: oven-sh/setup-bun@v2

      - run: ${frozenInstallCmd}`
      : pm === "pnpm"
        ? `      - uses: pnpm/action-setup@v6
${pnpmSetupVersion()}      - uses: actions/setup-node@v4
        with:
          node-version: ${nodeVersion}
          cache: pnpm

      - run: ${frozenInstallCmd}`
        : `      - uses: actions/setup-node@v4
        with:
          node-version: ${nodeVersion}
          cache: '${pm}'

      - run: ${frozenInstallCmd}`;

  const slackStep = includeSlack
    ? `
      - name: Notify Slack
        if: success()
        uses: slackapi/slack-github-action@v2.0.0
        with:
          webhook: \${{ secrets.SLACK_RELEASE_WEBHOOK_URL }}
          webhook-type: incoming-webhook
          payload: |
            {
              "text": "🚀 *\${{ github.repository }}* — new release published",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "🚀 *<\${{ github.server_url }}/\${{ github.repository }}/releases/latest|New release>* for *\${{ github.repository }}*\\n\\nTriggered by \${{ github.actor }}"
                  }
                }
              ]
            }`
    : "";

  return `name: Create Release

on:
  workflow_call:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  create-release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          fetch-tags: true

${setupStep}

      - name: Configure git identity
        run: |
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git config user.name "github-actions[bot]"

      - name: Release
        id: release
        run: ${runCmd} release
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          LEFTHOOK: 0
${slackStep}
`;
}

/** action-setup rejects a version input that is not the exact packageManager pin. */
function pnpmSetupVersion(): string {
  if (declaredPackageManager() === "pnpm") return "\n";
  return `        with:
          version: 12

`;
}

export function generateDeployWorkflow(config: UserConfig): string {
  const { prodBranch } = config;

  return `# Example: wire the release into your deploy pipeline
# Customize this to match your actual deploy steps
name: Deploy and Release

on:
  push:
    branches:
      - ${prodBranch}

permissions:
  contents: write

jobs:
  # Add your CI/deploy jobs here, e.g.:
  # ci:
  #   uses: ./.github/workflows/ci.yml
  #   secrets: inherit
  #
  # deploy:
  #   needs: [ci]
  #   ...

  release:
    # If you have deploy jobs, add: needs: [deploy]
    uses: ./.github/workflows/release.yml
    secrets: inherit
`;
}

export function generatePrTitleWorkflow(): string {
  return `name: PR Title Check

on:
  pull_request:
    types: [opened, edited]

permissions:
  pull-requests: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        with:
          types: |
            feat
            fix
            docs
            style
            refactor
            test
            build
            ci
            chore
            perf
          requireScope: false
`;
}
