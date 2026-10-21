import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import {
  applyPackageManagerChoice,
  commandsFor,
  conflictingManagers,
  detectPackageManager,
  staleLockfiles,
} from "../src/detect.ts";
import { generateContributing } from "../src/contributing.ts";
import { generateFiles } from "../src/generate.ts";
import { devInstallArgs, LINT_PACKAGES, withLefthookAllowBuild } from "../src/install.ts";
import { generateReleaseWorkflow } from "../src/workflows.ts";
import type { UserConfig } from "../src/prompts.ts";

const originalCwd = process.cwd();
const root = mkdtempSync(join(tmpdir(), "repo-ready-"));

function config(pm: UserConfig["pm"]): UserConfig {
  return {
    pm,
    prodBranch: "main",
    nodeVersion: 26,
    includeCommitlint: true,
    includeSlack: false,
    includeEmail: false,
    issueTracker: "none",
    customIssuePattern: "",
    repoName: "example",
    overwriteReleaseIt: true,
    overwritePrTemplate: true,
    overwriteContributing: true,
  };
}

describe("package manager selection", { concurrency: false }, () => {
  before(() => {
    process.chdir(root);
  });

  after(() => {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  });

  test("commands follow the package manager that was picked", () => {
    const pnpmWorkflow = generateReleaseWorkflow(config("pnpm"));
    assert.match(pnpmWorkflow, /cache: pnpm/);
    assert.match(pnpmWorkflow, /pnpm install --frozen-lockfile/);
    assert.match(pnpmWorkflow, /run: pnpm release/);
    assert.doesNotMatch(pnpmWorkflow, /npm ci/);

    const npmWorkflow = generateReleaseWorkflow(config("npm"));
    assert.match(npmWorkflow, /cache: 'npm'/);
    assert.match(npmWorkflow, /npm ci/);
    assert.match(npmWorkflow, /run: npm run release/);
    assert.doesNotMatch(npmWorkflow, /pnpm/);

    assert.equal(commandsFor("yarn").frozenInstallCmd, "yarn --frozen-lockfile");
    assert.equal(
      commandsFor("yarn").bin("prettier --write file.ts"),
      "yarn prettier --write file.ts"
    );
    assert.equal(commandsFor("pnpm").bin("lefthook install"), "pnpm exec lefthook install");
    assert.equal(commandsFor("npm").bin("release-it --dry-run"), "npx release-it --dry-run");
    assert.match(pnpmWorkflow, /actions\/checkout@v7\.0\.1/);
    assert.match(pnpmWorkflow, /actions\/setup-node@v7\.1\.0/);
    assert.doesNotMatch(generateReleaseWorkflow(config("yarn")), /corepack enable/);
  });

  test("pnpm setup omits version when packageManager names pnpm", async () => {
    const pinned = join(root, "pinned");
    mkdirSync(pinned);
    writeFileSync(join(pinned, "package.json"), JSON.stringify({ packageManager: "pnpm@12.14.0" }));
    process.chdir(pinned);
    const workflow = generateReleaseWorkflow(config("pnpm"));
    assert.match(workflow, /pnpm\/action-setup@v6\.1\.0/);
    assert.doesNotMatch(workflow, /version: 12/);

    const unpinned = join(root, "unpinned");
    mkdirSync(unpinned);
    writeFileSync(join(unpinned, "package.json"), JSON.stringify({ name: "example" }));
    process.chdir(unpinned);
    assert.match(generateReleaseWorkflow(config("pnpm")), /version: 12/);
  });

  test("packageManager is used when there is no lockfile", async () => {
    const dir = join(root, "declared-yarn");
    mkdirSync(dir);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ packageManager: "yarn@4.5.0" }));
    process.chdir(dir);
    assert.equal((await detectPackageManager()).pm, "yarn");
  });

  test("a lockfile wins over packageManager", async () => {
    const dir = join(root, "lock-wins");
    mkdirSync(dir);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ packageManager: "yarn@4.5.0" }));
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    process.chdir(dir);
    assert.equal((await detectPackageManager()).pm, "pnpm");
  });

  test("generated docs use the selected package manager", () => {
    const contributing = generateContributing(config("pnpm"));
    assert.match(contributing, /pnpm exec lefthook install/);
    assert.match(contributing, /pnpm exec release-it --dry-run/);
    assert.doesNotMatch(contributing, /npx /);
  });

  test("pnpm allows lefthook's build and records it for later installs", () => {
    const args = devInstallArgs("pnpm", LINT_PACKAGES);
    assert.deepEqual(args.slice(0, 3), ["add", "-D", "--allow-build=lefthook"]);
    assert.ok(args.includes("lefthook"));
    assert.deepEqual(devInstallArgs("pnpm", ["release-it"]), ["add", "-D", "release-it"]);
    assert.deepEqual(devInstallArgs("npm", ["lefthook"]), ["install", "-D", "lefthook"]);
    assert.deepEqual(devInstallArgs("yarn", ["lefthook"]), ["add", "-D", "lefthook"]);

    assert.equal(withLefthookAllowBuild(null), "allowBuilds:\n  lefthook: true\n");
    assert.equal(
      withLefthookAllowBuild("overrides:\n  foo: 1.0.0\n"),
      "overrides:\n  foo: 1.0.0\n\nallowBuilds:\n  lefthook: true\n"
    );
    assert.equal(
      withLefthookAllowBuild("allowBuilds:\n  esbuild: true\n"),
      "allowBuilds:\n  lefthook: true\n  esbuild: true\n"
    );
    assert.equal(
      withLefthookAllowBuild("allowBuilds:\n  lefthook: false\n"),
      "allowBuilds:\n  lefthook: true\n"
    );
    const existing = "allowBuilds:\n  lefthook: true\n";
    assert.equal(withLefthookAllowBuild(existing), existing);
  });

  test("devEngines.packageManager wins over packageManager, including arrays", async () => {
    const dir = join(root, "dev-engines");
    mkdirSync(dir);
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        packageManager: "npm@10.9.0",
        devEngines: { packageManager: { name: "pnpm", version: "12.14.0" } },
      })
    );
    process.chdir(dir);
    assert.equal((await detectPackageManager()).pm, "pnpm");
    assert.doesNotMatch(generateReleaseWorkflow(config("pnpm")), /version: 12/);

    const arrayDir = join(root, "dev-engines-array");
    mkdirSync(arrayDir);
    writeFileSync(
      join(arrayDir, "package.json"),
      JSON.stringify({
        packageManager: "npm@10.9.0",
        devEngines: { packageManager: ["bun@1.2.0"] },
      })
    );
    process.chdir(arrayDir);
    assert.equal((await detectPackageManager()).pm, "bun");

    const stringDir = join(root, "dev-engines-string");
    mkdirSync(stringDir);
    writeFileSync(
      join(stringDir, "package.json"),
      JSON.stringify({
        packageManager: "npm@10.9.0",
        devEngines: { packageManager: "yarn@3.6.0" },
      })
    );
    process.chdir(stringDir);
    assert.equal((await detectPackageManager()).pm, "yarn");
    assert.equal(commandsFor("yarn").frozenInstallCmd, "yarn install --immutable");
  });

  test("yarn 2+ uses an immutable install and corepack", () => {
    const dir = join(root, "yarn-berry");
    mkdirSync(dir);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ packageManager: "yarn@4.5.0" }));
    process.chdir(dir);
    assert.equal(commandsFor("yarn").frozenInstallCmd, "yarn install --immutable");
    const workflow = generateReleaseWorkflow(config("yarn"));
    assert.match(workflow, /corepack enable/);
    assert.match(workflow, /yarn install --immutable/);
    assert.match(workflow, /actions\/setup-node@v7\.1\.0/);
    assert.doesNotMatch(workflow, /--frozen-lockfile/);

    const classic = join(root, "yarn-classic");
    mkdirSync(classic);
    writeFileSync(
      join(classic, "package.json"),
      JSON.stringify({ packageManager: "yarn@1.22.22" })
    );
    process.chdir(classic);
    assert.equal(commandsFor("yarn").frozenInstallCmd, "yarn --frozen-lockfile");
    assert.doesNotMatch(generateReleaseWorkflow(config("yarn")), /corepack enable/);
  });

  test("switching managers rewrites only the fields that disagree", () => {
    const toPnpm = applyPackageManagerChoice(
      { name: "example", packageManager: "yarn@4.5.0", devEngines: { runtime: { name: "node" } } },
      "pnpm",
      "pnpm@12.14.0"
    );
    assert.equal(toPnpm.name, "example");
    assert.equal(toPnpm.packageManager, "pnpm@12.14.0");
    assert.deepEqual(toPnpm.devEngines?.packageManager, {
      name: "pnpm",
      version: "12.14.0",
      onFail: "download",
    });
    assert.deepEqual(toPnpm.devEngines?.runtime, { name: "node" });

    const toNpm = applyPackageManagerChoice(
      {
        packageManager: "yarn@4.5.0",
        devEngines: {
          packageManager: { name: "yarn", version: "4.5.0" },
          runtime: { name: "node" },
        },
      },
      "npm",
      "pnpm@12"
    );
    assert.equal(toNpm.packageManager, undefined);
    assert.equal(toNpm.devEngines?.packageManager, undefined);
    assert.deepEqual(toNpm.devEngines?.runtime, { name: "node" });

    const keepYarn = applyPackageManagerChoice(
      { packageManager: "yarn@4.5.0", devEngines: { packageManager: "npm@10.9.2" } },
      "yarn",
      "pnpm@12"
    );
    assert.equal(keepYarn.packageManager, "yarn@4.5.0");
    assert.equal(keepYarn.devEngines, undefined);
    assert.deepEqual(conflictingManagers({ packageManager: "yarn@4.5.0" }, "pnpm"), ["yarn"]);
    assert.deepEqual(conflictingManagers({ packageManager: "pnpm@12.14.0" }, "pnpm"), []);
    assert.deepEqual(
      staleLockfiles("pnpm", ["pnpm-lock.yaml", "package-lock.json", "bun.lockb", "README.md"]),
      ["package-lock.json", "bun.lockb"]
    );
  });

  test("pnpm setup lists pnpm-workspace.yaml when lefthook is included", async () => {
    const dir = join(root, "workspace-list");
    mkdirSync(dir);
    writeFileSync(join(dir, "pnpm-workspace.yaml"), "allowBuilds:\n  lefthook: true\n");
    process.chdir(dir);
    const { paths } = await generateFiles(config("pnpm"));
    assert.ok(paths.includes("pnpm-workspace.yaml"));

    const npmDir = join(root, "workspace-npm");
    mkdirSync(npmDir);
    writeFileSync(join(npmDir, "pnpm-workspace.yaml"), "allowBuilds:\n  lefthook: true\n");
    process.chdir(npmDir);
    const npmPaths = await generateFiles(config("npm"));
    assert.equal(npmPaths.paths.includes("pnpm-workspace.yaml"), false);
  });
});
