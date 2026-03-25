import enquirer from "enquirer";
import chalk from "chalk";
import { existsSync } from "fs";
import type { PackageManager } from "./detect.js";

const { prompt } = enquirer;

export interface UserConfig {
  pm: PackageManager;
  prodBranch: string;
  nodeVersion: number;
  includeCommitlint: boolean;
  includeSlack: boolean;
  includeEmail: boolean;
  repoName: string;
  overwriteReleaseIt: boolean;
  overwritePrTemplate: boolean;
  overwriteContributing: boolean;
  issueTracker: "none" | "jira" | "github" | "linear" | "custom";
  customIssuePattern: string;
}

export async function runPrompts(detectedPm: PackageManager): Promise<UserConfig> {
  console.log();

  // Package manager confirmation/override
  const { pm } = await prompt<{ pm: PackageManager }>({
    type: "select",
    name: "pm",
    message: "Package manager",
    choices: ["npm", "yarn", "pnpm"],
    initial: ["npm", "yarn", "pnpm"].indexOf(detectedPm),
  });

  const { prodBranch } = await prompt<{ prodBranch: string }>({
    type: "input",
    name: "prodBranch",
    message: "Production branch name",
    initial: "main",
  });

  const { nodeVersion } = await prompt<{ nodeVersion: string }>({
    type: "input",
    name: "nodeVersion",
    message: "Node version for CI",
    initial: "22",
    validate: (val: string) => /^\d+$/.test(val.trim()) || "Enter a number (e.g. 22)",
  });

  const { includeCommitlint } = await prompt<{ includeCommitlint: boolean }>({
    type: "confirm",
    name: "includeCommitlint",
    message: "Include commitlint + lefthook?",
    initial: true,
  });

  const { issueTracker } = await prompt<{ issueTracker: UserConfig["issueTracker"] }>({
    type: "select",
    name: "issueTracker",
    message: "Issue tracker (auto-appends issue ID to commits from branch name)",
    choices: [
      { name: "none", message: "None" },
      { name: "jira", message: "Jira  (e.g. PROJ-123)" },
      { name: "github", message: "GitHub Issues  (e.g. #123)" },
      { name: "linear", message: "Linear  (e.g. ENG-123)" },
      { name: "custom", message: "Custom pattern" },
    ],
  });

  let customIssuePattern = "";
  if (issueTracker === "custom") {
    const { pattern } = await prompt<{ pattern: string }>({
      type: "input",
      name: "pattern",
      message: "Branch pattern to extract (regex, e.g. [A-Z]{2,5}-[0-9]{1,4})",
      initial: "[A-Z]{2,5}-[0-9]{1,4}",
    });
    customIssuePattern = pattern;
  }

  const { includeSlack } = await prompt<{ includeSlack: boolean }>({
    type: "confirm",
    name: "includeSlack",
    message: "Include Slack release notification?",
    initial: true,
  });

  const { includeEmail } = await prompt<{ includeEmail: boolean }>({
    type: "confirm",
    name: "includeEmail",
    message: "Include email release notification?",
    initial: false,
  });

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

  // Try to get repo name from package.json or cwd
  const pkgName = await getPackageName();

  return {
    pm,
    prodBranch: prodBranch || "main",
    nodeVersion: parseInt(nodeVersion, 10) || 22,
    includeCommitlint,
    includeSlack,
    includeEmail,
    repoName: pkgName,
    overwriteReleaseIt,
    overwritePrTemplate,
    overwriteContributing,
    issueTracker,
    customIssuePattern,
  };
}

async function confirmOverwrite(filename: string): Promise<boolean> {
  const { overwrite } = await prompt<{ overwrite: boolean }>({
    type: "confirm",
    name: "overwrite",
    message: `${chalk.yellow(filename)} already exists. Overwrite?`,
    initial: false,
  });
  return overwrite;
}

async function getPackageName(): Promise<string> {
  try {
    const fs = await import("fs-extra");
    const pkg = await fs.readJson("package.json");
    return pkg.name || process.cwd().split("/").pop() || "my-project";
  } catch {
    return process.cwd().split("/").pop() || "my-project";
  }
}
