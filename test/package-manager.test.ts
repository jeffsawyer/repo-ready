import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { commandsFor, detectPackageManager } from "../src/detect.ts";
import { generateContributing } from "../src/contributing.ts";
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
    assert.equal(commandsFor("pnpm").bin("lefthook install"), "pnpm exec lefthook install");
    assert.equal(commandsFor("npm").bin("release-it --dry-run"), "npx release-it --dry-run");
  });

  test("pnpm setup omits version when packageManager names pnpm", async () => {
    const pinned = join(root, "pinned");
    mkdirSync(pinned);
    writeFileSync(join(pinned, "package.json"), JSON.stringify({ packageManager: "pnpm@12.14.0" }));
    process.chdir(pinned);
    const workflow = generateReleaseWorkflow(config("pnpm"));
    assert.match(workflow, /pnpm\/action-setup@v6/);
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
});
