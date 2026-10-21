import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

/** Fallback when nothing else identifies a package manager. */
export const DEFAULT_PACKAGE_MANAGER: PackageManager = "pnpm";

/** Node version written into generated CI. release-it 21 requires 22.22.2+, 24.15+, or 26+. */
export const DEFAULT_NODE_VERSION = 26;

export interface DetectResult {
  pm: PackageManager;
  installCmd: string;
  runCmd: string;
  frozenInstallCmd: string;
  addDevCmd: (packages: string[]) => string;
  /** Shell command that runs a project-local binary, for example `pnpm exec prettier`. */
  bin: (invocation: string) => string;
}

export function hasCommand(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function commandsFor(pm: PackageManager): DetectResult {
  return buildResult(pm);
}

/** package.json `packageManager` or `devEngines.packageManager`, when it names a supported manager. */
export function declaredPackageManager(): PackageManager | null {
  if (!existsSync("package.json")) return null;
  try {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      packageManager?: string;
      devEngines?: { packageManager?: { name?: string } | string };
    };
    const dev = pkg.devEngines?.packageManager;
    const raw = pkg.packageManager ?? (typeof dev === "string" ? dev : dev?.name) ?? "";
    return parsePackageManager(raw);
  } catch {
    return null;
  }
}

export function parsePackageManager(raw: string): PackageManager | null {
  const name = raw.trim().split("@")[0];
  if (name === "npm" || name === "yarn" || name === "pnpm" || name === "bun") return name;
  return null;
}

export async function detectPackageManager(): Promise<DetectResult> {
  if (existsSync("pnpm-lock.yaml")) return buildResult("pnpm");
  if (existsSync("yarn.lock")) return buildResult("yarn");
  if (existsSync("bun.lock") || existsSync("bun.lockb")) return buildResult("bun");
  if (existsSync("package-lock.json")) return buildResult("npm");

  const declared = declaredPackageManager();
  if (declared) return buildResult(declared);

  if (hasCommand("pnpm")) return buildResult("pnpm");
  if (hasCommand("yarn")) return buildResult("yarn");
  if (hasCommand("bun")) return buildResult("bun");
  if (hasCommand("npm")) return buildResult("npm");

  return buildResult(DEFAULT_PACKAGE_MANAGER);
}

function binRunner(pm: PackageManager): string {
  switch (pm) {
    case "pnpm":
      return "pnpm exec";
    case "yarn":
      return "yarn exec";
    case "bun":
      return "bunx";
    default:
      return "npx";
  }
}

function buildResult(pm: PackageManager): DetectResult {
  const configs: Record<PackageManager, Omit<DetectResult, "bin">> = {
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

  const runner = binRunner(pm);
  return { ...configs[pm], bin: (invocation) => `${runner} ${invocation}` };
}
