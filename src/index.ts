#!/usr/bin/env node
import chalk from "chalk";
import { existsSync } from "fs";
import enquirer from "enquirer";
import { execa } from "execa";
import { detectPackageManager } from "./detect.js";
import { runPrompts } from "./prompts.js";
import { installPackages } from "./install.js";
import { generateFiles } from "./generate.js";

const { prompt } = enquirer;

async function ensurePackageJson(): Promise<void> {
  if (existsSync("package.json")) return;

  console.log(chalk.yellow("⚠  No package.json found in current directory."));
  console.log(chalk.dim(`   ${process.cwd()}\n`));

  const { shouldInit } = await prompt<{ shouldInit: boolean }>({
    type: "confirm",
    name: "shouldInit",
    message: "Run npm init -y to create one now?",
    initial: true,
  });

  if (!shouldInit) {
    console.log(
      chalk.red("\n✖ Cannot continue without a package.json.") +
        chalk.dim("\n  Run `npm init` in your project directory first.\n")
    );
    process.exit(1);
  }

  const ora = (await import("ora")).default;
  const spinner = ora("Running npm init -y").start();
  try {
    await execa("npm", ["init", "-y"]);
    spinner.succeed("package.json created");
    console.log();
  } catch (err) {
    spinner.fail("npm init failed");
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

  // Run prompts
  const config = await runPrompts(detected.pm);

  console.log();
  console.log(chalk.bold("📦 Installing packages..."));
  await installPackages(detected, config.includeCommitlint);

  console.log();
  console.log(chalk.bold("📝 Generating files..."));
  const { paths } = await generateFiles(config, detected);

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
    "Commit all generated files",
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
    `Test with: ${chalk.cyan("npx release-it --dry-run --no-git.requireCleanWorkingDir")}`
  );

  steps.forEach((step, i) => {
    console.log(`  ${chalk.bold(String(i + 1) + ".")} ${step}`);
  });

  console.log();
}

main().catch((err) => {
  console.error(chalk.red("\n✖ Error:"), err.message);
  process.exit(1);
});
