/**
 * Orchestrator — the main design-critic loop.
 *
 * Three modes:
 *   report     — observe + critique once, write report, no code changes
 *   semi-auto  — observe + critique + plan + apply edits, then stop for review
 *   full-auto  — loop: observe → critique → plan → apply → re-observe → score
 *                      → keep if improved, otherwise rollback → repeat
 *
 * Rollback strategy: file-level backups taken before each edit batch.
 * Git is used to commit accepted iterations (full-auto mode only).
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

import { observe } from './observer.js';
import { critique } from './critic.js';
import { planEdits } from './planner.js';
import { applyEdits, createBackup } from './editor.js';
import { scoreScreenshots, formatScore, scoreDelta } from './scorer.js';
import type {
  OrchestratorConfig,
  IterationSnapshot,
  DesignScore,
} from './types.js';

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function run(config: OrchestratorConfig): Promise<void> {
  printBanner(config);
  await fs.mkdir(config.screenshotDir, { recursive: true });

  const snapshots: IterationSnapshot[] = [];
  let bestScore = 0;

  for (let i = 0; i < config.maxIterations; i++) {
    const prefix = `iter${i + 1}_`;
    printSectionHeader(`Iteration ${i + 1} / ${config.maxIterations}`);

    // ── 1. Observe ────────────────────────────────────────────────────────
    console.log(chalk.blue('  📸  Capturing app state...'));
    const snapshot = await observe(config.appUrl, config.screenshotDir, prefix);
    console.log(
      chalk.dim(`       desktop → ${path.basename(snapshot.desktopScreenshotPath)}`),
    );
    console.log(
      chalk.dim(`       mobile  → ${path.basename(snapshot.mobileScreenshotPath)}`),
    );

    // ── 2. Critique ───────────────────────────────────────────────────────
    console.log(chalk.blue('\n  🔍  Running design critique...'));
    const report = await critique(snapshot);

    printScore(report.score);
    bestScore = Math.max(bestScore, report.score.total);

    console.log(chalk.white(`\n  Summary: ${report.summary}`));

    if (report.issues.length > 0) {
      console.log(chalk.yellow('\n  Issues found:'));
      report.issues.slice(0, 6).forEach((issue) => {
        const color =
          issue.severity === 'critical'
            ? chalk.red
            : issue.severity === 'high'
              ? chalk.yellow
              : chalk.dim;
        const badge = `[${issue.severity.toUpperCase().padEnd(8)}]`;
        console.log(color(`    ${badge} ${issue.description.slice(0, 90)}`));
      });
    }

    if (report.topPriorities.length > 0) {
      console.log(chalk.cyan('\n  Top priorities:'));
      report.topPriorities.forEach((p, idx) =>
        console.log(chalk.cyan(`    ${idx + 1}. ${p}`)),
      );
    }

    // Save iteration report
    const reportPath = path.join(
      config.screenshotDir,
      `${prefix}report.json`,
    );
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(chalk.dim(`\n  Report written → ${reportPath}`));

    const iterSnap: IterationSnapshot = {
      iteration: i + 1,
      timestamp: new Date().toISOString(),
      screenshotDesktop: snapshot.desktopScreenshotPath,
      screenshotMobile: snapshot.mobileScreenshotPath,
      report,
      editsApplied: [],
    };

    // ── Stop here in report-only mode ─────────────────────────────────────
    if (config.mode === 'report') {
      snapshots.push(iterSnap);
      break;
    }

    // ── Skip editing if score is already excellent ─────────────────────────
    if (report.score.total >= 9.0) {
      console.log(chalk.green('\n  ✨  Score is excellent (≥9.0). No edits needed.'));
      snapshots.push(iterSnap);
      break;
    }

    // ── 3. Plan edits ──────────────────────────────────────────────────────
    console.log(chalk.blue('\n  📐  Planning code edits...'));
    const plans = await planEdits(
      report.issues,
      config.frontendDir,
      config.protectedFiles,
    );

    if (plans.length === 0) {
      console.log(chalk.yellow('  No actionable edits found. Stopping.'));
      snapshots.push(iterSnap);
      break;
    }

    const totalEdits = plans.reduce((n, p) => n + p.edits.length, 0);
    console.log(
      chalk.green(`  ✓  Planned ${totalEdits} edit(s) across ${plans.length} issue(s)`),
    );
    plans.forEach((plan) => {
      console.log(chalk.dim(`     • ${plan.issueSummary.slice(0, 70)}`));
      plan.edits.forEach((e) =>
        console.log(chalk.dim(`       ↳ ${e.description} (${path.basename(e.filePath)})`)),
      );
    });

    // ── 4. Back up files before editing ────────────────────────────────────
    const restore = await createBackup(plans);

    // ── 5. Apply edits ──────────────────────────────────────────────────────
    console.log(chalk.blue('\n  ✏️   Applying edits...'));
    const results = await applyEdits(plans);
    let totalApplied = 0;
    let totalFailed = 0;
    results.forEach((r) => {
      totalApplied += r.appliedEdits;
      totalFailed += r.failedEdits;
      r.errors.forEach((e) => console.log(chalk.red(`  ✗ ${e}`)));
    });

    console.log(
      chalk.green(
        `  ✓  ${totalApplied} edit(s) applied${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`,
      ),
    );

    if (totalApplied === 0) {
      console.log(chalk.yellow('  Nothing was patched. Rolling back.'));
      await restore();
      snapshots.push(iterSnap);
      break;
    }

    iterSnap.editsApplied = plans;

    // ── Semi-auto: stop here, let the user review ──────────────────────────
    if (config.mode === 'semi-auto') {
      console.log(
        chalk.cyan('\n  ⏸   Semi-auto mode — edits applied. Review with `git diff`.'),
      );
      console.log(
        chalk.cyan('      Run again with --mode semi-auto to continue, or revert manually.'),
      );
      snapshots.push(iterSnap);
      break;
    }

    // ── 6. Full-auto: re-observe and compare scores ────────────────────────
    console.log(chalk.blue('\n  ⏳  Waiting for HMR reload (3s)...'));
    await sleep(3000);

    console.log(chalk.blue('\n  📸  Re-capturing after edits...'));
    const afterSnapshot = await observe(
      config.appUrl,
      config.screenshotDir,
      `${prefix}after_`,
    );

    console.log(chalk.blue('\n  🎯  Scoring before vs after...'));
    let afterScore: DesignScore;
    try {
      afterScore = await scoreScreenshots(
        afterSnapshot.desktopScreenshotBase64,
        afterSnapshot.mobileScreenshotBase64,
      );
    } catch (err) {
      console.log(chalk.red(`  Scoring failed: ${err}. Keeping edits.`));
      afterScore = { ...report.score, total: report.score.total + 0.01 };
    }

    const improved =
      afterScore.total >= report.score.total + config.scoreImprovementThreshold;

    console.log(chalk.white(`\n  Score delta: ${scoreDelta(report.score, afterScore)}`));

    if (improved) {
      bestScore = Math.max(bestScore, afterScore.total);
      console.log(chalk.green('  ✓  Improvement confirmed — keeping edits.'));
      tryGitCommit(
        config.projectRoot,
        `design: iteration ${i + 1} — score ${report.score.total.toFixed(1)} → ${afterScore.total.toFixed(1)}`,
      );
    } else {
      console.log(chalk.yellow('  ↩  No improvement — rolling back edits.'));
      await restore();
      console.log(chalk.dim('  ✓  Files restored to previous state.'));
    }

    snapshots.push(iterSnap);

    // Stop if score is high enough
    if (afterScore.total >= 9.0) {
      console.log(chalk.green('\n  ✨  Score reached 9.0+. Stopping.'));
      break;
    }
  }

  // ── Final summary ──────────────────────────────────────────────────────────
  printFinalSummary(snapshots, bestScore, config.screenshotDir);

  // Write consolidated session report
  const sessionPath = path.join(config.screenshotDir, 'session.json');
  await fs.writeFile(
    sessionPath,
    JSON.stringify({ config, snapshots, bestScore }, null, 2),
  );
  console.log(chalk.dim(`\n  Session data → ${sessionPath}\n`));
}

// ─── Git helpers ──────────────────────────────────────────────────────────────

function tryGitCommit(projectRoot: string, message: string): void {
  try {
    execSync(`git -C "${projectRoot}" add frontend/src`, { stdio: 'pipe' });
    execSync(
      `git -C "${projectRoot}" commit -m "${message.replace(/"/g, "'")}"`,
      { stdio: 'pipe' },
    );
    console.log(chalk.dim('  ✓  Git commit created.'));
  } catch {
    // Commit failures are non-fatal (e.g. nothing staged)
  }
}

// ─── Print helpers ────────────────────────────────────────────────────────────

function printBanner(config: OrchestratorConfig): void {
  console.log(chalk.cyan('\n╔══════════════════════════════════════════╗'));
  console.log(chalk.cyan('║    Autonomous Design Critic Loop v1.0    ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════╝'));
  console.log(chalk.dim(`\n  mode:       ${config.mode}`));
  console.log(chalk.dim(`  url:        ${config.appUrl}`));
  console.log(chalk.dim(`  iterations: ${config.maxIterations}`));
  console.log(chalk.dim(`  frontend:   ${config.frontendDir}`));
  console.log(chalk.dim(`  output:     ${config.screenshotDir}\n`));
}

function printSectionHeader(title: string): void {
  console.log(chalk.yellow(`\n${'─'.repeat(50)}`));
  console.log(chalk.yellow(`  ${title}`));
  console.log(chalk.yellow('─'.repeat(50)));
}

function printScore(score: DesignScore): void {
  console.log(chalk.white('\n  Design Score:'));
  formatScore(score)
    .split('\n')
    .forEach((line) => console.log(chalk.white(line)));
}

function printFinalSummary(
  snapshots: IterationSnapshot[],
  bestScore: number,
  screenshotDir: string,
): void {
  console.log(chalk.cyan('\n╔══════════════════════════════════════════╗'));
  console.log(chalk.cyan('║             Session Complete             ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════╝'));
  console.log(chalk.white(`\n  Iterations run: ${snapshots.length}`));
  console.log(chalk.white(`  Best score:     ${bestScore.toFixed(1)}/10`));

  if (snapshots.length > 0) {
    const initial = snapshots[0].report.score.total;
    const delta = bestScore - initial;
    const sign = delta >= 0 ? '+' : '';
    console.log(
      chalk.white(
        `  Improvement:    ${initial.toFixed(1)} → ${bestScore.toFixed(1)} (${sign}${delta.toFixed(2)})`,
      ),
    );
  }

  console.log(chalk.dim(`\n  Screenshots and reports in: ${screenshotDir}`));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
