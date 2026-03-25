import { execa } from "execa";
import ora from "ora";
import fs from "fs-extra";
import type { DetectResult } from "./detect.js";

export async function installPackages(
  detected: DetectResult,
  includeCommitlint: boolean
): Promise<void> {
  const { pm } = detected;

  const corePackages = ["release-it", "@release-it/conventional-changelog"];
  const lintPackages = [
    "@commitlint/cli",
    "@commitlint/config-conventional",
    "lefthook",
    "prettier",
    "eslint",
    "@eslint/js",
    "typescript-eslint",
  ];

  await runInstall(pm, corePackages, "Installing release-it + changelog plugin");

  if (includeCommitlint) {
    await runInstall(pm, lintPackages, "Installing commitlint + lefthook");
  }

  // Write scripts directly to package.json — works for npm, yarn, and pnpm
  const scriptsSpinner = ora("Adding scripts to package.json").start();
  try {
    const pkg = await fs.readJson("package.json");
    pkg.scripts = pkg.scripts ?? {};
    pkg.scripts.release = "release-it --ci";
    if (includeCommitlint) {
      pkg.scripts.prepare = "lefthook install";
    }
    await fs.writeJson("package.json", pkg, { spaces: 2 });
    scriptsSpinner.succeed("Added scripts to package.json");
  } catch {
    scriptsSpinner.fail(
      'Could not update package.json — add manually: "release": "release-it --ci"'
    );
  }

  if (includeCommitlint) {
    const prepareSpinner = ora("Installing lefthook hooks").start();
    try {
      await execa("npx", ["lefthook", "install"]);
      prepareSpinner.succeed("Lefthook hooks installed");
    } catch {
      prepareSpinner.fail("Could not install lefthook hooks — run `npx lefthook install` manually");
    }
  }
}

async function runInstall(pm: string, packages: string[], label: string): Promise<void> {
  const spinner = ora(label).start();

  const args = getInstallArgs(pm, packages);

  try {
    await execa(pm, args, { stdio: "pipe" });
    spinner.succeed(label);
  } catch (err) {
    spinner.fail(`${label} — failed`);
    throw new Error(`Install failed: ${(err as Error).message}`, { cause: err });
  }
}

function getInstallArgs(pm: string, packages: string[]): string[] {
  switch (pm) {
    case "yarn":
      return ["add", "-D", ...packages];
    case "pnpm":
      return ["add", "-D", ...packages];
    default:
      return ["install", "-D", ...packages];
  }
}
