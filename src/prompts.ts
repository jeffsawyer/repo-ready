import enquirer from "enquirer";
import chalk from "chalk";
import { existsSync } from "fs";
import fs from "fs-extra";
import type { PackageManager } from "./detect.js";

const { prompt } = enquirer;

export interface UserConfig {
  pm: PackageManager;
  prodBranch: string;
  nodeVersion: number;
  includeCommitlint: boolean;
  includeSlack: boolean;
  includeEmail: boolean;
  issueTracker: "none" | "jira" | "github" | "linear" | "custom";
  customIssuePattern: string;
  repoName: string;
  overwriteReleaseIt: boolean;
  overwritePrTemplate: boolean;
  overwriteContributing: boolean;
}

const PM_CHOICES: PackageManager[] = ["npm", "yarn", "pnpm", "bun"];

export async function runPrompts(detectedPm: PackageManager): Promise<UserConfig> {
  console.log();

  // Package manager confirmation/override
  const { pm } = await prompt<{ pm: PackageManager }>({
    type: "select",
    name: "pm",
    message: "Package manager",
    choices: PM_CHOICES,
    initial: PM_CHOICES.indexOf(detectedPm),
  } as any);

  const { prodBranch } = await prompt<{ prodBranch: string }>({
    type: "input",
    name: "prodBranch",
    message: "Production branch name",
    initial: "main",
  } as any);

  const { nodeVersion } = await prompt<{ nodeVersion: string }>({
    type: "input",
    name: "nodeVersion",
    message: "Node version for CI",
    initial: "20",
    validate: (val: string) =>
      /^\d+$/.test(val.trim()) || "Enter a number (e.g. 20)",
  } as any);

  const { includeCommitlint } = await prompt<{ includeCommitlint: boolean }>({
    type: "confirm",
    name: "includeCommitlint",
    message: "Include commitlint + lefthook + prettier + eslint?",
    initial: true,
  } as any);

  let issueTracker: UserConfig["issueTracker"] = "none";
  let customIssuePattern = "";

  if (includeCommitlint) {
    const { tracker } = await prompt<{ tracker: UserConfig["issueTracker"] }>({
      type: "select",
      name: "tracker",
      message: "Issue tracker (auto-appends issue ID to commits from branch name)",
      choices: [
        { name: "none", message: "None" },
        { name: "jira", message: "Jira  (e.g. PROJ-123)" },
        { name: "github", message: "GitHub Issues  (e.g. #123)" },
        { name: "linear", message: "Linear  (e.g. ENG-123)" },
        { name: "custom", message: "Custom pattern" },
      ],
    } as any);
    issueTracker = tracker;

    if (issueTracker === "custom") {
      const { pattern } = await prompt<{ pattern: string }>({
        type: "input",
        name: "pattern",
        message: "Branch pattern to extract (regex, e.g. [A-Z]{2,5}-[0-9]{1,4})",
        initial: "[A-Z]{2,5}-[0-9]{1,4}",
      } as any);
      customIssuePattern = pattern;
    }
  }

  const { includeSlack } = await prompt<{ includeSlack: boolean }>({
    type: "confirm",
    name: "includeSlack",
    message: "Include Slack release notification?",
    initial: true,
  } as any);

  const { includeEmail } = await prompt<{ includeEmail: boolean }>({
    type: "confirm",
    name: "includeEmail",
    message: "Include email release notification?",
    initial: false,
  } as any);

  // Check for existing files
  const overwriteReleaseIt = existsSync(".release-it.json")
    ? await confirmOverwrite(".release-it.json")
    : true;

  const overwritePrTemplate = existsSync(".github/pull_request_template.md")
    ? await confirmOverwrite(".github/pull_request_template.md")
    : true;

  const overwriteContributing = existsSync("CONTRIBUTING.md")
    ? await confirmOverwrite("CONTRIBUTING.md")
    : true;

  const pkgName = await getPackageName();

  return {
    pm,
    prodBranch: prodBranch || "main",
    nodeVersion: parseInt(nodeVersion, 10) || 20,
    includeCommitlint,
    includeSlack,
    includeEmail,
    issueTracker,
    customIssuePattern,
    repoName: pkgName,
    overwriteReleaseIt,
    overwritePrTemplate,
    overwriteContributing,
  };
}

async function confirmOverwrite(filename: string): Promise<boolean> {
  const { overwrite } = await prompt<{ overwrite: boolean }>({
    type: "confirm",
    name: "overwrite",
    message: `${chalk.yellow(filename)} already exists. Overwrite?`,
    initial: false,
  } as any);
  return overwrite;
}

async function getPackageName(): Promise<string> {
  try {
    const pkg = await fs.readJson("package.json");
    return pkg.name || process.cwd().split("/").pop() || "my-project";
  } catch {
    return process.cwd().split("/").pop() || "my-project";
  }
}
