import type { UserConfig } from "./prompts.js";
import type { DetectResult } from "./detect.js";

export function generateReleaseWorkflow(
  config: UserConfig,
  detected: DetectResult
): string {
  const { nodeVersion, includeSlack, pm } = config;
  const { frozenInstallCmd, runCmd } = detected;

  // bun doesn't use actions/setup-node cache
  const cacheConfig = pm !== "bun" ? `
          cache: '${pm}'` : "";

  // bun needs its own setup action
  const setupStep = pm === "bun"
    ? `      - uses: oven-sh/setup-bun@v2

      - run: ${frozenInstallCmd}`
    : `      - uses: actions/setup-node@v4
        with:
          node-version: ${nodeVersion}${cacheConfig}

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
${slackStep}
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
