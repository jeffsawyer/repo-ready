import { existsSync } from "fs";
import { execSync } from "child_process";

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

/** Fallback when no lockfile exists and no package manager binary is installed. */
export const DEFAULT_PACKAGE_MANAGER: PackageManager = "pnpm";

export interface DetectResult {
  pm: PackageManager;
  installCmd: string;
  runCmd: string;
  frozenInstallCmd: string;
  addDevCmd: (packages: string[]) => string;
}

export function hasCommand(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function detectPackageManager(): Promise<DetectResult> {
  if (existsSync("pnpm-lock.yaml")) return buildResult("pnpm");
  if (existsSync("yarn.lock")) return buildResult("yarn");
  if (existsSync("bun.lock") || existsSync("bun.lockb")) return buildResult("bun");
  if (existsSync("package-lock.json")) return buildResult("npm");

  // No lockfile — pnpm is the default when it is available.
  if (hasCommand("pnpm")) return buildResult("pnpm");
  if (hasCommand("yarn")) return buildResult("yarn");
  if (hasCommand("bun")) return buildResult("bun");
  if (hasCommand("npm")) return buildResult("npm");

  return buildResult(DEFAULT_PACKAGE_MANAGER);
}

function buildResult(pm: PackageManager): DetectResult {
  const configs: Record<PackageManager, DetectResult> = {
    npm: {
      pm: "npm",
      installCmd: "npm install",
      runCmd: "npm run",
      frozenInstallCmd: "npm ci",
      addDevCmd: (pkgs) => `npm install -D ${pkgs.join(" ")}`,
    },
    yarn: {
      pm: "yarn",
      installCmd: "yarn install",
      runCmd: "yarn",
      frozenInstallCmd: "yarn --frozen-lockfile",
      addDevCmd: (pkgs) => `yarn add -D ${pkgs.join(" ")}`,
    },
    pnpm: {
      pm: "pnpm",
      installCmd: "pnpm install",
      runCmd: "pnpm",
      frozenInstallCmd: "pnpm install --frozen-lockfile",
      addDevCmd: (pkgs) => `pnpm add -D ${pkgs.join(" ")}`,
    },
    bun: {
      pm: "bun",
      installCmd: "bun install",
      runCmd: "bun run",
      frozenInstallCmd: "bun install --frozen-lockfile",
      addDevCmd: (pkgs) => `bun add -d ${pkgs.join(" ")}`,
    },
  };

  return configs[pm];
}
