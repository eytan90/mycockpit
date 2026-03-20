/**
 * Editor — applies CodeEdit patches to source files.
 *
 * Each edit specifies an exact `oldCode` substring and its `newCode`
 * replacement. The patch is applied with a simple string replace so that
 * no diff library dependency is required. If oldCode is not found in the file
 * the edit is skipped and an error is recorded.
 */

import fs from 'fs/promises';
import type { EditPlan, CodeEdit } from './types.js';

export interface EditResult {
  plan: EditPlan;
  appliedEdits: number;
  failedEdits: number;
  errors: string[];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function applyEdits(plans: EditPlan[]): Promise<EditResult[]> {
  const results: EditResult[] = [];
  for (const plan of plans) {
    results.push(await applyPlan(plan));
  }
  return results;
}

/**
 * Back up all files that will be touched by the given plans.
 * Returns a restore function — call it to undo every edit.
 */
export async function createBackup(
  plans: EditPlan[],
): Promise<() => Promise<void>> {
  const backups = new Map<string, string>();

  for (const plan of plans) {
    for (const edit of plan.edits) {
      if (!backups.has(edit.filePath)) {
        try {
          backups.set(edit.filePath, await fs.readFile(edit.filePath, 'utf-8'));
        } catch {
          // file unreadable — skip
        }
      }
    }
  }

  return async () => {
    for (const [filePath, original] of backups.entries()) {
      await fs.writeFile(filePath, original, 'utf-8');
    }
  };
}

// ─── Internals ────────────────────────────────────────────────────────────────

async function applyPlan(plan: EditPlan): Promise<EditResult> {
  let applied = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const edit of plan.edits) {
    try {
      await applyCodeEdit(edit);
      applied++;
    } catch (err) {
      failed++;
      errors.push(
        `${edit.filePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { plan, appliedEdits: applied, failedEdits: failed, errors };
}

async function applyCodeEdit(edit: CodeEdit): Promise<void> {
  if (!edit.oldCode || !edit.newCode) {
    throw new Error('Edit has empty oldCode or newCode.');
  }

  const content = await fs.readFile(edit.filePath, 'utf-8');

  if (!content.includes(edit.oldCode)) {
    throw new Error(
      `Could not locate target string in file. ` +
        `Expected to find: ${JSON.stringify(edit.oldCode.slice(0, 80))}...`,
    );
  }

  // Only replace the first occurrence to avoid unintended mass-changes
  const newContent = content.replace(edit.oldCode, edit.newCode);
  await fs.writeFile(edit.filePath, newContent, 'utf-8');
}
