import { execa } from "execa";
import ora from "ora";
import fs from "fs-extra";
import type { DetectResult, PackageManager } from "./detect.js";

export const CORE_PACKAGES = ["release-it", "@release-it/conventional-changelog"];

export const LINT_PACKAGES = [
  "@commitlint/cli",
  "@commitlint/config-conventional",
  "lefthook",
  "prettier",
  "eslint",
  "@eslint/js",
  "typescript-eslint",
  "typescript@~5.8.3",
];

export async function installPackages(
  selected: DetectResult,
  includeCommitlint: boolean
): Promise<void> {
  const { pm, bin } = selected;

  await runInstall(pm, CORE_PACKAGES, "Installing release-it + changelog plugin");

  if (includeCommitlint) {
    await runInstall(pm, LINT_PACKAGES, "Installing commitlint, lefthook, prettier + eslint");
  }

  // Write scripts directly to package.json — works for npm, yarn, pnpm and bun
  const scriptsSpinner = ora("Adding scripts to package.json").start();
  try {
    const pkg = await fs.readJson("package.json");
    pkg.scripts = pkg.scripts ?? {};
    pkg.scripts.release = "LEFTHOOK=0 release-it --ci";
    if (includeCommitlint) {
      pkg.scripts.prepare = bin("lefthook install");
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
      const [cmd, ...args] = bin("lefthook install").split(" ");
      await execa(cmd, args);
      prepareSpinner.succeed("Lefthook hooks installed");
    } catch {
      prepareSpinner.fail(
        `Could not install lefthook hooks — run \`${bin("lefthook install")}\` manually`
      );
    }
  }
}

/** Arguments for `pm …`. pnpm 11+ errors when lefthook's postinstall is skipped. */
export function devInstallArgs(pm: PackageManager | string, packages: readonly string[]): string[] {
  switch (pm) {
    case "yarn":
      return ["add", "-D", ...packages];
    case "pnpm": {
      const args = ["add", "-D"];
      if (packages.some(isLefthook)) args.push("--allow-build=lefthook");
      args.push(...packages);
      return args;
    }
    case "bun":
      return ["add", "-d", ...packages];
    default:
      return ["install", "-D", ...packages];
  }
}

/**
 * pnpm records `--allow-build` in pnpm-workspace.yaml. Write it ourselves too,
 * so a later `pnpm install --frozen-lockfile` still builds lefthook.
 */
export function withLefthookAllowBuild(existing: string | null): string {
  if (existing == null || existing.trim() === "") {
    return "allowBuilds:\n  lefthook: true\n";
  }
  const normalized = existing.endsWith("\n") ? existing : `${existing}\n`;
  if (/lefthook[ \t]*:[ \t]*true\b/.test(normalized)) return normalized;
  if (/^[ \t]*lefthook[ \t]*:[ \t]*false[ \t]*$/m.test(normalized)) {
    return normalized.replace(/^([ \t]*)lefthook[ \t]*:[ \t]*false[ \t]*$/m, "$1lefthook: true");
  }
  const lines = normalized.split("\n");
  const header = lines.findIndex((line) => /^allowBuilds[ \t]*:[ \t]*$/.test(line));
  if (header !== -1) {
    lines.splice(header + 1, 0, "  lefthook: true");
    return lines.join("\n");
  }
  return `${normalized}\nallowBuilds:\n  lefthook: true\n`;
}

async function runInstall(
  pm: PackageManager | string,
  packages: readonly string[],
  label: string
): Promise<void> {
  const spinner = ora(label).start();
  const args = devInstallArgs(pm, packages);

  try {
    await execa(pm, args, { stdio: "pipe" });
    if (pm === "pnpm" && packages.some(isLefthook)) await ensureLefthookAllowBuild();
    spinner.succeed(label);
  } catch (err: unknown) {
    spinner.fail(`${label} — failed`);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Install failed: ${message}`, { cause: err });
  }
}

async function ensureLefthookAllowBuild(): Promise<void> {
  const path = "pnpm-workspace.yaml";
  const existing = (await fs.pathExists(path)) ? await fs.readFile(path, "utf8") : null;
  const next = withLefthookAllowBuild(existing);
  if (next !== existing) await fs.writeFile(path, next);
}

function isLefthook(pkg: string): boolean {
  return pkg === "lefthook" || pkg.startsWith("lefthook@");
}
