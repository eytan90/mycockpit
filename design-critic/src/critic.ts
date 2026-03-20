/**
 * Critic — sends screenshots + DOM to Claude and gets a structured issue report.
 *
 * Uses claude-opus-4-6 with adaptive thinking and streaming so it can reason
 * deeply about both the visual and structural aspects of the UI.
 */

import { client } from './claude-cli.js';
import type { TextBlock } from './claude-cli.js';
import type { CriticReport } from './types.js';
import type { ObserverResult } from './observer.js';

// ─── System prompt (design constitution embedded) ─────────────────────────────

const CRITIC_SYSTEM = `\
You are a senior product designer and design systems engineer specializing in premium \
minimal iOS-inspired web applications.

You evaluate React UIs against this exact design constitution:

══ DESIGN CONSTITUTION ══════════════════════════════════════════════

VIBE: Minimal · calm · premium ambient lab dashboard. iOS 26 aesthetic.
Content-first. Every element must serve a purpose. "Zen / premium dark dashboard."

RULE 1 — HIERARCHY OVER TILES
• One clear focal point per screen; secondary content below
• Avoid equally-weighted 2×2 tile grids
• Most data belongs in grouped list rows, not large tiles
• Reserve large cards for genuinely important content

RULE 2 — GLASS ONLY IN CHROME
• Liquid Glass (blur/translucency) belongs only on: top bar, tab bar, overlays, chips, sidebars
• NEVER apply glass blur to content cards or data containers
• Content surfaces must be clean and readable

RULE 3 — TYPOGRAPHY SCALE
• Large Title 34px bold — page greeting / title
• Title 22px bold — section headings
• Headline 17px semibold — row titles
• Body 17px regular — content text
• Subhead 15px — metadata
• Caption 11–12px — labels/timestamps
• Use fewer sizes consistently; no all-caps except section labels

RULE 4 — COLORS
• Backgrounds: #000000 (base), #1C1C1E (surface), #2C2C2E (secondary)
• Text: #FFFFFF (primary), #8E8E93 (secondary), #636366 (muted)
• Accents: #0A84FF (blue), #30D158 (green), #FF453A (red), #FF9F0A (amber), #BF5AF2 (purple)
• Maximum 2–3 accent colors visible at once; each semantically meaningful
• No neon/decorative colors

RULE 5 — SPACING (4/8pt grid)
• Outer margin: 16px mobile, 24px desktop
• Section gap: 32px
• Row padding: 11px vertical × 16px horizontal
• Corner radius: 12px sections, 10px controls, 8px chips
• No decorative divider lines in page chrome
• Hairline (0.5px) separators only between list rows

RULE 6 — RESPONSIVENESS
• Mobile-first; primary actions in thumb reach (bottom half of screen)
• Touch targets minimum 44pt height
• Nothing overflows viewport at 390px

RULE 7 — ACCESSIBILITY
• Minimum 4.5:1 contrast ratio for small text
• Status must use shape + icon + label, not color alone
• No aria-label omissions on icon-only controls

RULE 8 — INTERACTIONS
• Every control has a visible, clear purpose
• No dead/placeholder buttons without effect
• Chevron on drill-down rows
• Subtle motion only (0.18–0.28s); no distracting animations

RULE 9 — NO GENERIC WEB DASHBOARD
• No heavy opaque rounded rectangles everywhere
• No thick borders on containers (use background contrast instead)
• No "SaaS dashboard" aesthetic — this is a premium personal cockpit

══ SCORING WEIGHTS ══════════════════════════════════════════════════

visual_clarity:     25% — hierarchy, focal point, no clutter
consistency:        20% — colors/spacing/type used consistently
responsiveness:     20% — good at 390px mobile
accessibility:      15% — contrast, touch targets, semantics
vibe_match:         20% — matches zen/minimal/premium aesthetic
interaction_clarity:10% — clear CTAs, affordances, no dead controls

total = 0.25·clarity + 0.20·consistency + 0.20·responsiveness + 0.15·accessibility + 0.20·vibe + 0.10·interaction

══════════════════════════════════════════════════════════════════════

You MUST respond with ONLY a single JSON object matching this schema exactly:
{
  "issues": [
    {
      "id": "string (short slug, e.g. issue-01)",
      "severity": "critical | high | medium | low",
      "category": "hierarchy | spacing | consistency | responsiveness | accessibility | vibe | interaction | layout | typography | color",
      "description": "string (specific, actionable, ≤120 chars)",
      "location": "string (component or area, e.g. 'TopBar', 'Home hero section', 'mobile nav')",
      "affectedComponents": ["string"],
      "suggestedFix": "string (concrete CSS/Tailwind/JSX suggestion)"
    }
  ],
  "score": {
    "visual_clarity": number,
    "consistency": number,
    "responsiveness": number,
    "accessibility": number,
    "vibe_match": number,
    "interaction_clarity": number,
    "total": number
  },
  "summary": "string (2–3 sentences)",
  "topPriorities": ["string (3 most impactful actions)"]
}

Do not include markdown, prose, or any text outside the JSON object.`;

// ─── Critic function ──────────────────────────────────────────────────────────

export async function critique(snapshot: ObserverResult): Promise<CriticReport> {
  const interactiveSample = JSON.stringify(
    snapshot.interactiveElements.slice(0, 30),
    null,
    2,
  );

  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: CRITIC_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `## Page: "${snapshot.pageInfo.title}" (${snapshot.pageInfo.url})\n\n### Desktop screenshot (1440×900):`,
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: snapshot.desktopScreenshotBase64,
            },
          },
          {
            type: 'text',
            text: '### Mobile screenshot (390×844 — iPhone 14):',
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: snapshot.mobileScreenshotBase64,
            },
          },
          {
            type: 'text',
            text: [
              '### DOM structure (abbreviated):',
              '```html',
              snapshot.domSnapshot,
              '```',
              '',
              '### Interactive elements (bounds in px):',
              '```json',
              interactiveSample,
              '```',
              '',
              'Analyze this UI thoroughly against the design constitution.',
              'Return the JSON report now.',
            ].join('\n'),
          },
        ],
      },
    ],
  });

  const message = await stream.finalMessage();

  const text = message.content
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  // Extract JSON — handle both bare JSON and ```json fenced blocks
  const jsonMatch =
    text.match(/```json\s*\n?([\s\S]*?)\n?```/) ??
    text.match(/(\{[\s\S]*\})/);

  if (!jsonMatch) {
    throw new Error(
      `Critic returned no parseable JSON. Response preview:\n${text.slice(0, 400)}`,
    );
  }

  return JSON.parse(jsonMatch[1]) as CriticReport;
}
