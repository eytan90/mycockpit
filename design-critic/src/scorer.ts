/**
 * Scorer — asks Claude to score a UI screenshot pair against the design constitution.
 *
 * Used in full-auto mode to compare before/after screenshots and decide
 * whether to keep or revert an iteration's changes.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { DesignScore } from './types.js';

const client = new Anthropic();

const SCORER_SYSTEM = `\
You are a UI design evaluator. Score the provided screenshots on these dimensions (0–10 each):

- visual_clarity:     Is the hierarchy clear? One focal point? No clutter?
- consistency:        Colors, spacing, and typography used consistently?
- responsiveness:     Does it look good on mobile (second image, 390px)?
- accessibility:      Adequate contrast, touch targets ≥44pt, semantic structure?
- vibe_match:         Matches a zen/minimal/premium dark lab dashboard aesthetic?
- interaction_clarity: CTAs are clear? No dead buttons? Good affordances?

Compute the weighted total:
  total = 0.25·visual_clarity + 0.20·consistency + 0.20·responsiveness
        + 0.15·accessibility + 0.20·vibe_match + 0.10·interaction_clarity

Respond with ONLY a JSON object — no prose, no fences:
{"visual_clarity":X,"consistency":X,"responsiveness":X,"accessibility":X,"vibe_match":X,"interaction_clarity":X,"total":X}`;

// ─── Public API ───────────────────────────────────────────────────────────────

export async function scoreScreenshots(
  desktopBase64: string,
  mobileBase64: string,
): Promise<DesignScore> {
  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 256,
    system: SCORER_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Desktop (1440px):',
          },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: desktopBase64 },
          },
          {
            type: 'text',
            text: 'Mobile (390px):',
          },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: mobileBase64 },
          },
          {
            type: 'text',
            text: 'Score this UI now.',
          },
        ],
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Scorer returned no JSON. Preview: ${text.slice(0, 200)}`);
  }

  return JSON.parse(jsonMatch[0]) as DesignScore;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function formatScore(score: DesignScore): string {
  const bar = (n: number) => '█'.repeat(Math.round(n)).padEnd(10, '░');
  const fmt = (label: string, n: number) =>
    `  ${label.padEnd(22)} ${bar(n)} ${n.toFixed(1)}`;

  return [
    `  ${'TOTAL'.padEnd(22)} ${bar(score.total)} ${score.total.toFixed(1)}/10`,
    '',
    fmt('Visual clarity', score.visual_clarity),
    fmt('Consistency', score.consistency),
    fmt('Responsiveness', score.responsiveness),
    fmt('Accessibility', score.accessibility),
    fmt('Vibe match', score.vibe_match),
    fmt('Interaction clarity', score.interaction_clarity),
  ].join('\n');
}

export function scoreDelta(before: DesignScore, after: DesignScore): string {
  const delta = after.total - before.total;
  const sign = delta >= 0 ? '+' : '';
  return `${before.total.toFixed(1)} → ${after.total.toFixed(1)} (${sign}${delta.toFixed(2)})`;
}
