/**
 * CLI entry point for the autonomous design critic.
 *
 * Usage:
 *   npm run report        # screenshot + critique, no code changes
 *   npm run semi-auto     # critique + apply edits, stop for review
 *   npm run full-auto     # loop until score improves or max iterations
 *
 * Or directly:
 *   npx tsx src/cli.ts --mode semi-auto --url http://localhost:5173
 */

import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

import { run } from './orchestrator.js';
import type { OrchestratorConfig, RunMode } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve project root: design-critic/src/ → design-critic/ → project root
const designCriticDir = path.resolve(__dirname, '..');
const projectRoot = path.resolve(designCriticDir, '..');
const defaultFrontend = path.join(projectRoot, 'frontend');
const defaultScreenshots = path.join(designCriticDir, '.screenshots');

const program = new Command();

program
  .name('design-critic')
  .description(
    'Autonomous UI/UX design critic + self-improving loop for MyCockpit.\n\n' +
      'Modes:\n' +
      '  report     Observe + critique only, no code changes\n' +
      '  semi-auto  Observe + critique + plan + apply edits, then pause\n' +
      '  full-auto  Loop: observe → critique → edit → score → keep/revert',
  )
  .option(
    '-m, --mode <mode>',
    'Run mode: report | semi-auto | full-auto',
    'report',
  )
  .option(
    '-u, --url <url>',
    'URL of the running app',
    'http://localhost:5173',
  )
  .option(
    '-i, --iterations <n>',
    'Max iterations (full-auto mode)',
    '3',
  )
  .option(
    '--frontend <dir>',
    'Absolute path to frontend/ directory',
    defaultFrontend,
  )
  .option(
    '--screenshots <dir>',
    'Output directory for screenshots and reports',
    defaultScreenshots,
  )
  .option(
    '--protect <files>',
    'Comma-separated file path substrings that must never be edited',
    '',
  )
  .option(
    '--threshold <n>',
    'Minimum score improvement to keep an iteration (full-auto)',
    '0.3',
  )
  .addHelpText(
    'after',
    `
Examples:
  npx tsx src/cli.ts --mode report
  npx tsx src/cli.ts --mode semi-auto --url http://localhost:5173
  npx tsx src/cli.ts --mode full-auto --iterations 5 --threshold 0.5
  npx tsx src/cli.ts --mode semi-auto --protect "index.css,tailwind.config.ts"
`,
  )
  .parse(process.argv);

const opts = program.opts<{
  mode: string;
  url: string;
  iterations: string;
  frontend: string;
  screenshots: string;
  protect: string;
  threshold: string;
}>();

// Validate mode
const VALID_MODES: RunMode[] = ['report', 'semi-auto', 'full-auto'];
if (!VALID_MODES.includes(opts.mode as RunMode)) {
  console.error(
    `Invalid mode "${opts.mode}". Must be one of: ${VALID_MODES.join(', ')}`,
  );
  process.exit(1);
}

const config: OrchestratorConfig = {
  mode: opts.mode as RunMode,
  appUrl: opts.url,
  maxIterations: Math.max(1, parseInt(opts.iterations, 10) || 3),
  projectRoot,
  frontendDir: opts.frontend,
  screenshotDir: opts.screenshots,
  protectedFiles: opts.protect
    ? opts.protect.split(',').map((f) => f.trim()).filter(Boolean)
    : [],
  scoreImprovementThreshold: parseFloat(opts.threshold) || 0.3,
};

run(config).catch((err: unknown) => {
  console.error('\nFatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
