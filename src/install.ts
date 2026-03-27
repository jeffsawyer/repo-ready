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
    "typescript@~5.8.3",
  ];

  await runInstall(pm, corePackages, "Installing release-it + changelog plugin");

  if (includeCommitlint) {
    await runInstall(pm, lintPackages, "Installing commitlint, lefthook, prettier + eslint");
  }

  // Write scripts directly to package.json — works for npm, yarn, pnpm and bun
  const scriptsSpinner = ora("Adding scripts to package.json").start();
  try {
    const pkg = await fs.readJson("package.json");
    pkg.scripts = pkg.scripts ?? {};
    pkg.scripts.release = "LEFTHOOK=0 release-it --ci";
    if (includeCommitlint) {
      pkg.scripts.prepare = "lefthook install";
    }
    await fs.writeJson("package.json", pkg, { spaces: 2 });
    scriptsSpinner.succeed("Added scripts to package.json");
  } catch {
    scriptsSpinner.fail(
      'Could not update package.json — add manually: "release": "LEFTHOOK=0 release-it --ci"'
    );
  }

  if (includeCommitlint) {
    const prepareSpinner = ora("Installing lefthook hooks").start();
    try {
      await execa("npx", ["lefthook", "install"]);
      prepareSpinner.succeed("Lefthook hooks installed");
    } catch {
      prepareSpinner.fail(
        "Could not install lefthook hooks — run `npx lefthook install` manually"
      );
    }
  }
}

async function runInstall(
  pm: string,
  packages: string[],
  label: string
): Promise<void> {
  const spinner = ora(label).start();
  const args = getInstallArgs(pm, packages);

  try {
    await execa(pm, args, { stdio: "pipe" });
    spinner.succeed(label);
  } catch (err: unknown) {
    spinner.fail(`${label} — failed`);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Install failed: ${message}`, { cause: err });
  }
}

function getInstallArgs(pm: string, packages: string[]): string[] {
  switch (pm) {
    case "yarn":
      return ["add", "-D", ...packages];
    case "pnpm":
      return ["add", "-D", ...packages];
    case "bun":
      return ["add", "-d", ...packages];
    default:
      return ["install", "-D", ...packages];
  }
}
