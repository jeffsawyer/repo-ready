#!/usr/bin/env node
import chalk from "chalk";
import fs from "fs-extra";
import enquirer from "enquirer";
import { execa } from "execa";
import {
  applyPackageManagerChoice,
  commandsFor,
  conflictingManagers,
  detectPackageManager,
  hasCommand,
  staleLockfiles,
  type PackageJson,
  type PackageManager,
} from "./detect.js";
import { runPrompts } from "./prompts.js";
import { installPackages } from "./install.js";
import { generateFiles } from "./generate.js";

const { prompt } = enquirer;

async function ensurePackageJson(): Promise<void> {
  if (fs.existsSync("package.json")) return;

  console.log(chalk.yellow("⚠  No package.json found in current directory."));
  console.log(chalk.dim(`   ${process.cwd()}\n`));

  const { shouldInit } = await prompt<{ shouldInit: boolean }>({
    type: "confirm",
    name: "shouldInit",
    message: "Create a basic package.json to continue?",
    initial: true,
  });

  if (!shouldInit) {
    const initCommand = hasCommand("pnpm") ? "pnpm init" : "npm init -y";
    console.log(
      chalk.red("\n✖ Cannot continue without a package.json.") +
        chalk.dim(`\n  Run \`${initCommand}\` in your project directory first.\n`)
    );
    process.exit(1);
  }

  const ora = (await import("ora")).default;
  const spinner = ora("Creating package.json").start();
  const initWithPnpm = hasCommand("pnpm");
  try {
    if (initWithPnpm) {
      await execa("pnpm", ["init"]);
    } else {
      await execa("npm", ["init", "-y"]);
    }
    spinner.succeed("package.json created");
    console.log();
  } catch (err: unknown) {
    spinner.fail(initWithPnpm ? "pnpm init failed" : "npm init failed");
    throw err;
  }
}

async function main() {
  console.log(
    chalk.bold.cyan(`
██████╗ ███████╗██████╗  ██████╗       ██████╗ ███████╗ █████╗ ██████╗ ██╗   ██╗
██╔══██╗██╔════╝██╔══██╗██╔═══██╗      ██╔══██╗██╔════╝██╔══██╗██╔══██╗╚██╗ ██╔╝
██████╔╝█████╗  ██████╔╝██║   ██║█████╗██████╔╝█████╗  ███████║██║  ██║ ╚████╔╝ 
██╔══██╗██╔══╝  ██╔═══╝ ██║   ██║╚════╝██╔══██╗██╔══╝  ██╔══██║██║  ██║  ╚██╔╝  
██║  ██║███████╗██║     ╚██████╔╝      ██║  ██║███████╗██║  ██║██████╔╝   ██║   
╚═╝  ╚═╝╚══════╝╚═╝      ╚═════╝       ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝    ╚═╝   
`)
  );
  console.log(chalk.dim("  Zero-friction release automation for JS/TS repos\n"));

  // Ensure package.json exists before anything else
  await ensurePackageJson();

  // Detect package manager
  const detected = await detectPackageManager();
  console.log(
    chalk.green(`✔`) + chalk.dim(` Detected package manager: `) + chalk.bold(detected.pm)
  );

  // Run prompts. Every later command follows the choice, not the lockfile that was detected.
  const config = await runPrompts(detected.pm);
  await confirmPackageManagerSwitch(config.pm);
  const selected = commandsFor(config.pm);

  console.log();
  console.log(chalk.bold("📦 Installing packages..."));
  await installPackages(selected, config.includeCommitlint);
  const lockfileStep = await offerStaleLockfileCleanup(config.pm);

  console.log();
  console.log(chalk.bold("📝 Generating files..."));
  const { paths } = await generateFiles(config);

  // Summary
  console.log();
  console.log(chalk.bold.green("✅ Setup complete!"));
  console.log();
  console.log(chalk.bold("Generated files:"));
  for (const p of paths) {
    console.log(chalk.dim("  ") + chalk.cyan(p));
  }

  console.log();
  console.log(chalk.bold("Next steps:"));

  const steps = [
    ...(lockfileStep ? [lockfileStep] : []),
    `Commit all generated files with ${chalk.cyan("[skip ci]")} to prevent a premature release:\n     ${chalk.dim(`git commit -m "chore: repo-ready setup [skip ci]"`)}`,
    `In GitHub repo settings → Pull Requests → enable ${chalk.bold(
      "Squash merging"
    )} (default to PR title + description)`,
  ];

  if (config.includeSlack) {
    steps.push(
      `Create a Slack Incoming Webhook and add it as ${chalk.bold(
        "SLACK_RELEASE_WEBHOOK_URL"
      )} in repo Settings → Secrets\n     ${chalk.dim(
        "→ https://api.slack.com/messaging/webhooks"
      )}`
    );
  }

  steps.push(
    `Customize ${chalk.cyan(
      ".github/workflows/deploy-and-release.yml"
    )} for your actual deploy pipeline`,
    `Test with: ${chalk.cyan(selected.bin("release-it --dry-run --no-git.requireCleanWorkingDir"))}`
  );

  steps.forEach((step, i) => {
    console.log(`  ${chalk.bold(String(i + 1) + ".")} ${step}`);
  });

  console.log();
}

/** pnpm refuses to install when package.json names a different manager. */
async function confirmPackageManagerSwitch(chosen: PackageManager): Promise<void> {
  const pkg = (await fs.readJson("package.json")) as PackageJson;
  const conflicts = conflictingManagers(pkg, chosen);
  if (conflicts.length === 0) return;

  const listed = conflicts.join(" and ");
  const { shouldSwitch } = await prompt<{ shouldSwitch: boolean }>({
    type: "confirm",
    name: "shouldSwitch",
    message: `package.json is set up for ${listed}, but you chose ${chosen}. Update it so ${chosen} can install?`,
    initial: true,
  });

  if (!shouldSwitch) {
    throw new Error(
      `This project is configured to use ${listed}, so ${chosen} will not install. Choose ${listed}, or update the packageManager field.`
    );
  }

  const pnpmSpec = chosen === "pnpm" ? await currentPnpmSpec() : "pnpm@12";
  const next = applyPackageManagerChoice(pkg, chosen, pnpmSpec);
  await fs.writeJson("package.json", next, { spaces: 2 });
  if (chosen === "pnpm") {
    console.log(chalk.green("✔") + chalk.dim(" package.json now uses ") + chalk.bold(pnpmSpec));
  } else {
    console.log(
      chalk.green("✔") +
        chalk.dim(" Updated package.json so ") +
        chalk.bold(chosen) +
        chalk.dim(" can install")
    );
  }
}

async function currentPnpmSpec(): Promise<string> {
  try {
    const { stdout } = await execa("pnpm", ["--version"], { timeout: 10000 });
    const version = stdout.trim();
    if (/^\d+\.\d+\.\d+/.test(version)) return `pnpm@${version}`;
  } catch {
    // pnpm is missing, or it could not print a version. The pin still has to name pnpm.
  }
  return "pnpm@12";
}

/** A second lockfile makes the next run, and other tools, guess the wrong manager. */
async function offerStaleLockfileCleanup(chosen: PackageManager): Promise<string | null> {
  const candidates = ["pnpm-lock.yaml", "yarn.lock", "package-lock.json", "bun.lock", "bun.lockb"];
  const present = candidates.filter((file) => fs.existsSync(file));
  const stale = staleLockfiles(chosen, present);
  if (stale.length === 0) return null;

  const noun = stale.length > 1 ? "lockfiles" : "lockfile";
  const { shouldDelete } = await prompt<{ shouldDelete: boolean }>({
    type: "confirm",
    name: "shouldDelete",
    message: `Delete the old ${noun} (${stale.join(", ")})?`,
    initial: true,
  });

  if (!shouldDelete) {
    return `Delete the old ${noun} so it is not confused with the ${chosen} one: ${chalk.cyan(stale.join(", "))}`;
  }

  for (const file of stale) await fs.remove(file);
  console.log(chalk.green("✔") + chalk.dim(` Removed ${stale.join(", ")}`));
  return null;
}

main().catch((err) => {
  console.error(chalk.red("\n✖ Error:"), err.message);
  process.exit(1);
});
