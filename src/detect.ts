import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

/**
 * Fallback when no lockfile, package.json field, or installed binary names a manager.
 * pnpm is the project default, not something detection found.
 */
export const DEFAULT_PACKAGE_MANAGER: PackageManager = "pnpm";

/** Node version written into generated CI. release-it 21 requires 22.22.2+, 24.15+, or 26+. */
export const DEFAULT_NODE_VERSION = 26;

const LOCKFILES: Record<PackageManager, readonly string[]> = {
  pnpm: ["pnpm-lock.yaml"],
  yarn: ["yarn.lock"],
  npm: ["package-lock.json"],
  bun: ["bun.lock", "bun.lockb"],
};

type DevEngineEntry = { name?: string; version?: string; onFail?: string };
type DevEngineValue = DevEngineEntry | string | Array<DevEngineEntry | string>;

export interface PackageJson {
  packageManager?: string;
  devEngines?: {
    packageManager?: DevEngineValue;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

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

/**
 * Supported manager named by the project.
 * `devEngines.packageManager` wins over `packageManager`, matching pnpm and pnpm/action-setup.
 * An array uses the first entry that names npm, yarn, pnpm, or bun.
 */
export function declaredPackageManager(): PackageManager | null {
  return declaredFromPackage(readPackageJson());
}

export function declaredFromPackage(pkg: PackageJson | null): PackageManager | null {
  if (!pkg) return null;
  for (const spec of rawManagerSpecs(pkg)) {
    const parsed = parsePackageManager(spec);
    if (parsed) return parsed;
  }
  return null;
}

/** Managers named in package.json that are not the one the user just chose. */
export function conflictingManagers(pkg: PackageJson, chosen: PackageManager): PackageManager[] {
  const found: PackageManager[] = [];
  for (const spec of rawManagerSpecs(pkg)) {
    const parsed = parsePackageManager(spec);
    if (parsed && parsed !== chosen && !found.includes(parsed)) found.push(parsed);
  }
  return found;
}

/**
 * Make package.json agree with the chosen manager.
 * pnpm gets an explicit spec. Anything else keeps a matching pin and drops the rest,
 * so we never invent an npm or yarn version.
 */
export function applyPackageManagerChoice(
  pkg: PackageJson,
  chosen: PackageManager,
  pnpmSpec: string
): PackageJson {
  const next: PackageJson = { ...pkg };
  if (chosen === "pnpm") {
    const version = pnpmSpec.startsWith("pnpm@") ? pnpmSpec.slice("pnpm@".length) : "12";
    next.packageManager = pnpmSpec;
    const devEngines = { ...(asRecord(pkg.devEngines) ?? {}) };
    const current = asRecord(devEngines.packageManager);
    devEngines.packageManager = {
      ...(current ?? {}),
      name: "pnpm",
      version,
      onFail: typeof current?.onFail === "string" ? current.onFail : "download",
    };
    next.devEngines = devEngines;
    return next;
  }

  if (typeof next.packageManager === "string") {
    const parsed = parsePackageManager(next.packageManager);
    if (parsed && parsed !== chosen) delete next.packageManager;
  }

  const devEngines = asRecord(next.devEngines);
  if (devEngines && "packageManager" in devEngines) {
    const names = managerNames(devEngines.packageManager);
    if (names.some((name) => name !== chosen)) {
      const rest = { ...devEngines };
      delete rest.packageManager;
      if (Object.keys(rest).length === 0) delete next.devEngines;
      else next.devEngines = rest;
    }
  }
  return next;
}

/** Lockfiles that belong to a manager other than the one in use. */
export function staleLockfiles(chosen: PackageManager, present: readonly string[]): string[] {
  const foreign = new Set(
    (Object.keys(LOCKFILES) as PackageManager[])
      .filter((name) => name !== chosen)
      .flatMap((name) => LOCKFILES[name])
  );
  return present.filter((file) => foreign.has(file));
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

/** Yarn 2+ needs `yarn install --immutable`. Yarn 1, and yarn with no pin, stay classic. */
export function usesYarnBerry(): boolean {
  const pkg = readPackageJson();
  if (!pkg) return false;
  for (const spec of rawManagerSpecs(pkg)) {
    if (parsePackageManager(spec) !== "yarn") continue;
    const version = spec.split("@")[1] ?? "";
    const major = Number.parseInt(version, 10);
    return Number.isFinite(major) && major >= 2;
  }
  return false;
}

function readPackageJson(): PackageJson | null {
  if (!existsSync("package.json")) return null;
  try {
    return JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

function rawManagerSpecs(pkg: PackageJson): string[] {
  const specs: string[] = [];
  const dev = pkg.devEngines?.packageManager;
  const entries = Array.isArray(dev) ? dev : dev == null ? [] : [dev];
  for (const entry of entries) specs.push(...specFromEntry(entry));
  if (typeof pkg.packageManager === "string") specs.push(pkg.packageManager);
  return specs;
}

function specFromEntry(entry: DevEngineEntry | string): string[] {
  if (typeof entry === "string") return [entry];
  const record = asRecord(entry);
  if (!record || typeof record.name !== "string") return [];
  const version = typeof record.version === "string" ? `@${record.version}` : "";
  return [`${record.name}${version}`];
}

function managerNames(value: unknown): PackageManager[] {
  const entries = Array.isArray(value) ? value : value == null ? [] : [value];
  const names: PackageManager[] = [];
  for (const entry of entries) {
    for (const spec of specFromEntry(entry as DevEngineEntry | string)) {
      const parsed = parsePackageManager(spec);
      if (parsed && !names.includes(parsed)) names.push(parsed);
    }
  }
  return names;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function binRunner(pm: PackageManager): string {
  switch (pm) {
    case "pnpm":
      return "pnpm exec";
    case "yarn":
      // `yarn exec` on Yarn 1 drops everything after the first flag.
      return "yarn";
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
      frozenInstallCmd: usesYarnBerry() ? "yarn install --immutable" : "yarn --frozen-lockfile",
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
