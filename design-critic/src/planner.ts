/**
 * Planner — converts design issues into concrete code edits.
 *
 * For each high/critical issue it:
 *  1. Identifies the most relevant source file
 *  2. Reads that file
 *  3. Asks Claude to produce minimal, targeted old→new code patches
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import type { DesignIssue, EditPlan, CodeEdit } from './types.js';

const client = new Anthropic();

// Max source lines sent to Claude (to stay within sensible token budgets)
const MAX_FILE_CHARS = 8_000;

// ─── Public API ───────────────────────────────────────────────────────────────

export async function planEdits(
  issues: DesignIssue[],
  frontendDir: string,
  protectedFiles: string[] = [],
): Promise<EditPlan[]> {
  const srcDir = path.join(frontendDir, 'src');

  // Build file tree once
  const allFiles = await glob('**/*.{tsx,ts,css}', { cwd: srcDir });
  const fileTree = allFiles.join('\n');

  // Target top-priority issues only (avoid over-editing in one pass)
  const targetIssues = prioritizeIssues(issues).slice(0, 3);

  const plans: EditPlan[] = [];
  for (const issue of targetIssues) {
    const plan = await planSingleIssue(issue, srcDir, fileTree, protectedFiles);
    if (plan) plans.push(plan);
  }
  return plans;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function prioritizeIssues(issues: DesignIssue[]): DesignIssue[] {
  const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  return [...issues].sort((a, b) => order[a.severity] - order[b.severity]);
}

async function planSingleIssue(
  issue: DesignIssue,
  srcDir: string,
  fileTree: string,
  protectedFiles: string[],
): Promise<EditPlan | null> {
  // ── Step 1: identify target file ──────────────────────────────────────────
  const pickResponse = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 128,
    system:
      'You are a React/TypeScript expert. Given a UI issue and a file tree, respond with ONLY the relative file path ' +
      '(e.g. "components/TopBar.tsx") that is most likely to fix the issue. Nothing else — no explanation, no punctuation.',
    messages: [
      {
        role: 'user',
        content:
          `Issue: ${issue.description}\n` +
          `Location: ${issue.location}\n` +
          `Affected components: ${issue.affectedComponents.join(', ')}\n\n` +
          `File tree:\n${fileTree}`,
      },
    ],
  });

  const rawPath = pickResponse.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text.trim())
    .join('')
    .split('\n')[0]
    .trim()
    // strip leading "src/" if present
    .replace(/^src\//, '');

  const absolutePath = path.join(srcDir, rawPath);

  // Verify file exists and is not protected
  try {
    await fs.access(absolutePath);
  } catch {
    return null; // file not found — skip
  }

  if (protectedFiles.some((p) => absolutePath.includes(p))) {
    return null;
  }

  // ── Step 2: read file and ask for precise edit ────────────────────────────
  const rawContent = await fs.readFile(absolutePath, 'utf-8');
  const fileContent =
    rawContent.length > MAX_FILE_CHARS
      ? rawContent.slice(0, MAX_FILE_CHARS) + '\n// ... (file truncated for context)'
      : rawContent;

  const editStream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: `\
You are a React/TypeScript/Tailwind CSS expert making minimal, targeted UI fixes.

RULES:
- Return ONLY a JSON object — no prose, no markdown fences
- "oldCode" must be an EXACT verbatim substring of the file (copy-paste precisely, preserve whitespace/indentation)
- "newCode" is the replacement for that exact substring
- Minimum viable change: touch the fewest lines possible
- Only change styling/layout/classes — never change business logic or data flow
- Use only Tailwind classes and CSS custom properties already in the project
- Maximum 2 edits per issue

JSON schema:
{
  "edits": [
    {
      "description": "short human label",
      "oldCode": "exact verbatim string",
      "newCode": "replacement string",
      "reasoning": "why this fixes the issue"
    }
  ]
}`,
    messages: [
      {
        role: 'user',
        content: [
          `## Design Issue to Fix`,
          `Severity: ${issue.severity}`,
          `Category: ${issue.category}`,
          `Description: ${issue.description}`,
          `Location: ${issue.location}`,
          `Suggested fix: ${issue.suggestedFix}`,
          ``,
          `## Source File: ${rawPath}`,
          '```tsx',
          fileContent,
          '```',
          ``,
          `Produce the minimal targeted JSON edit to fix this design issue.`,
        ].join('\n'),
      },
    ],
  });

  const editMessage = await editStream.finalMessage();
  const editText = editMessage.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  // Parse JSON — handle fenced and bare formats
  const jsonMatch =
    editText.match(/```json\s*\n?([\s\S]*?)\n?```/) ??
    editText.match(/(\{[\s\S]*\})/);

  if (!jsonMatch) return null;

  let parsed: { edits: Array<Omit<CodeEdit, 'filePath'>> };
  try {
    parsed = JSON.parse(jsonMatch[1]);
  } catch {
    return null;
  }

  const edits: CodeEdit[] = (parsed.edits ?? [])
    .slice(0, 2) // cap at 2 per issue
    .map((e) => ({ ...e, filePath: absolutePath }));

  if (edits.length === 0) return null;

  return {
    issueId: issue.id,
    issueSummary: issue.description,
    edits,
  };
}
