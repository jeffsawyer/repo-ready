import { existsSync } from "fs";
import { execSync } from "child_process";

export type PackageManager = "npm" | "yarn" | "pnpm";

export interface DetectResult {
  pm: PackageManager;
  installCmd: string;
  runCmd: string;
  frozenInstallCmd: string;
  addDevCmd: (packages: string[]) => string;
}

function hasCommand(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function detectPackageManager(): Promise<DetectResult> {
  let pm: PackageManager = "npm";

  if (existsSync("pnpm-lock.yaml")) {
    pm = "pnpm";
  } else if (existsSync("yarn.lock")) {
    pm = "yarn";
  } else if (!existsSync("package-lock.json")) {
    // No lockfile — detect from environment
    if (hasCommand("pnpm")) {
      pm = "pnpm";
    } else if (hasCommand("yarn")) {
      pm = "yarn";
    }
  }

  return buildResult(pm);
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
  };

  return configs[pm];
}
